# Deploy de aplicações separadas

São dois repositórios e duas aplicações no Coolify. O front continua estático; o admin roda Next e seu worker, com banco e storage persistente.

## Front — este repositório

Mantenha a aplicação atual em **Railpack / Static**, build `npm run build`, saída `dist` e o domínio/prefixo atual. O `base` continua em `astro.config.mjs` por meio de `site.config.mjs`.

Configure no ambiente de **build**:

```dotenv
CONTENT_API_URL=https://admin.exemplo.com/api/public/content
CONTENT_API_TOKEN=<PUBLICATION_SECRET do admin>
PUBLIC_ADMIN_API_URL=https://admin.exemplo.com/api/public/leads
```

O build baixa e valida o snapshot, depois compila as páginas Astro. API configurada mas indisponível faz o build falhar, mantendo o deploy anterior. Sem API configurada, usa os JSON locais. O arquivo temporário `.content/` não é versionado. O token privado é removido do ambiente passado ao Astro.

O `Dockerfile` da raiz é uma alternativa para servir somente o front na porta 80. A configuração Nginx em `deploy/frontend.conf` segue o prefixo atual. Para build Docker autenticado, forneça o token como secret BuildKit de id `CONTENT_API_TOKEN`; se o seu Coolify não disponibilizar esse secret no build Docker, mantenha Railpack. Não passe o token como argumento público de build.

## Admin — repositório independente

A pasta local `admin/` possui seu próprio Git e é ignorada neste repositório. No remoto do admin, seu conteúdo fica na raiz: `package.json`, `Dockerfile`, `prisma/`, `src/`, `seed/` e `public/`.

Crie outra aplicação Coolify com build **Dockerfile**, base `/`, porta **3001**, domínio próprio e volume persistente **`/data`** (UID 1000). Configure banco, segredos, `ADMIN_ORIGIN=https://admin.exemplo.com`, `LP_URL=https://demos.jlacode.com.br/camelatto-design/` e `ALLOWED_ORIGINS=https://demos.jlacode.com.br`. A origem CORS não inclui o caminho da LP.

O painel abre em `/login` no domínio do admin. Para usar um prefixo opcional, configure `NEXT_PUBLIC_ADMIN_BASE_PATH` antes do build e no runtime, preservando o caminho no proxy. Não reutilize automaticamente o `base` do Astro.

Banco existente: preserve os dados e usuários. Preserve também os arquivos do storage antigo; mova-os para `/data/storage` ou mantenha S3. As URLs de mídia conhecidas são normalizadas pela API para o domínio atual. Banco novo: rode `npm run db:setup`, `npm run content:import`, `npm run admin:user` no terminal do container.

## Publicação

Sem automação: o worker libera o snapshot na API e você executa o deploy do front no Coolify.

Com automação: configure no admin `COOLIFY_API_URL=https://coolify.exemplo.com/api/v1`, `COOLIFY_API_TOKEN` e `COOLIFY_FRONTEND_UUID` (UUID do front). O worker chama o deploy e consulta o resultado pela [API oficial](https://coolify.io/docs/api/endpoints/deployments/deploy-by-tag-or-uuid). O front busca o snapshot candidato com o token, e o admin marca a publicação como concluída após confirmação. Não execute deployments manuais concorrentes durante essa operação.

Primeira instalação: suba o admin, publique o conteúdo sem automação, configure a API no front e faça o primeiro deploy. Depois ative as variáveis de automação se desejar. Configure no Coolify a recuperação/reinicialização do container quando o healthcheck falhar.
