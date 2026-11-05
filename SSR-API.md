# Camelatto Design — LP com SSR e API

## Estado da integração

- [x] Astro em `output: 'server'`, com adapter Node standalone.
- [x] Conteúdo consultado na API pelo servidor a cada requisição; sem cache de conteúdo entre visitas.
- [x] Home, seções, projetos, FAQ e SEO provenientes do banco através da API.
- [x] Removidos imports dos JSONs e `getStaticPaths()`; snapshots preservados somente em `tests/fixtures`.
- [x] URL da API e timeout em `astro:env/server`, com acesso `secret`; não são enviados ao navegador.
- [x] Timeout, limite de resposta de 2 MiB, validação de contrato e recusa de redirecionamentos na consulta à API.
- [x] Páginas 404 e 503 independentes da API; 503 inclui `Retry-After: 60`.
- [x] FAQ renderizado com elementos nativos `details` e `summary`.
- [x] SEO principal e por projeto no HTML; Schema.org `Person` com JSON-LD escapado.
- [x] QA com prefixo `/camelatto-design/` e `noindex, nofollow`.
- [x] Produção no domínio `ericacamelatto.com.br`, sem prefixo.
- [x] Testados builds QA/produção, assets, atualização sem rebuild e recuperação após falha da API.
- [x] Integração real local: Node SSR → API Bun → banco local configurado.
- [ ] Publicar os processos e configurar proxy/TLS nos servidores de QA e produção.

## Fluxo e arquivos

`Navegador → servidor Astro/Node → API Elysia/Bun → MySQL`.

`src/middleware.ts` carrega `GET /v1/content` antes da renderização da home ou de um projeto e armazena o resultado apenas no contexto daquela requisição. Projetos são encontrados pelo slug no conteúdo publicado. Para a página de projeto, a LP consulta também `GET /v1/seo?path=/projetos/slug`. Se apenas esse registro SEO não existir, usa título e descrição do projeto; falhas de conexão ou contrato produzem 503.

`src/server/api.ts` valida status HTTP, tipo de conteúdo e schemas de resposta. A origem da API é configuração fixa do servidor, nunca um parâmetro da URL do visitante. Cookies, Authorization e outros headers recebidos do navegador não são encaminhados à API. Não existe proxy genérico público.

`src/models/content.ts` é o contrato independente dos antigos JSONs, compatível com os modelos da API. Mudanças futuras de contrato devem atualizar ambos os projetos e seus testes.

`src/utils/urls.ts` trata caminhos com o prefixo de QA, recusa protocolos executáveis/URLs com credenciais e escapa JSON-LD. Os componentes continuam escapando texto editorial. Imagens com as chaves `mobile`, `web` e `research` usam os assets locais existentes; uma URL HTTP(S) ou caminho local pode ser renderizado como imagem sem download arbitrário no servidor.

SSR mantém a configuração da conexão no servidor. Os endpoints de conteúdo da API são públicos por definição; SSR não adiciona autenticação a esses endpoints. Nenhuma credencial MySQL deve existir na LP.

## Desenvolvimento local

Na API (`camelatto-design-api`), configurar o `.env` e executar:

```sh
bun install --frozen-lockfile
bun run db:migrate
bun run db:seed
bun run dev
```

A migration e o seed já foram aplicados no banco local configurado durante esta integração, preservando as tabelas preexistentes. O seed é executado uma única vez e reaplicações preservam edições. O servidor local encontrado é MariaDB 12.3.3; a validação no MySQL da hospedagem continua pendente.

Na LP (`camellato-design`):

```sh
bun install --frozen-lockfile
bun run dev
```

Por padrão, desenvolvimento usa `http://localhost:4321/` e a API em `http://127.0.0.1:3000`. Para mudar a conexão, copiar `.env.example` para `.env` e ajustar `API_URL`. A LP não precisa de banco, senha de banco, JWT ou API key para ler conteúdo público.

## Variáveis

| Variável         | Quando é usada      | Regra                                                                                               |
| ---------------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| `SITE_ENV`       | Build               | `development`, `qa` ou `production`; define domínio, base e indexação                               |
| `API_URL`        | Servidor em runtime | Base da API sem `/v1`; permite conexão interna ou URL pública; padrão local `http://127.0.0.1:3000` |
| `API_TIMEOUT_MS` | Servidor em runtime | Inteiro entre 100 e 30000; padrão 5000                                                              |
| `HOST`           | Processo Node       | Usar `127.0.0.1` atrás de proxy ou `0.0.0.0` se necessário na rede do container                     |
| `PORT`           | Processo Node       | Padrão 4321 para a LP; API é outro processo/porta                                                   |

`API_URL` não aceita credenciais na URL, query string ou fragmento. Não prefixar variáveis privadas com `PUBLIC_`. Em produção, preferir endereço de rede interna da API e TLS se a conexão cruzar uma rede não confiável.

`SITE_ENV` fica definido no build; não muda o domínio/base de um artefato já compilado. Já `API_URL` e `API_TIMEOUT_MS` podem mudar ao reiniciar o processo, sem rebuild.

## QA

```sh
bun run build:qa
bun run test:ssr qa
bun run start
```

A LP atende em `/camelatto-design/`. URL pública: `https://demos.jlacode.com.br/camelatto-design`. Mesmo sendo build otimizado, o ambiente QA envia meta robots e header `X-Robots-Tag` com `noindex, nofollow`.

Configuração de runtime da LP se a API estiver no mesmo host:

```dotenv
API_URL=http://127.0.0.1:3000
API_TIMEOUT_MS=5000
HOST=127.0.0.1
PORT=4321
```

Se não existir acesso interno à API, usar `API_URL=https://demos.jlacode.com.br/camelatto-design/api`. A base externa é preservada pelo cliente, que acrescenta `/v1/content`.

No proxy, preservar o caminho da LP e remover o prefixo apenas ao encaminhar à API:

```nginx
location ^~ /camelatto-design/api/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location ^~ /camelatto-design/ {
    proxy_pass http://127.0.0.1:4321;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Integrar esse trecho na configuração existente, com redirects para os caminhos base com barra final. Reservar `/camelatto-design/admin/` para o processo do admin quando ele existir; esse caminho não pertence à LP. A configuração de proxy não foi publicada nesta entrega.

## Produção

```sh
bun run build:prod
bun run test:ssr production
bun run start
```

Domínio da LP: `https://ericacamelatto.com.br`. API pública: `https://api.ericacamelatto.com.br`. Configurar `API_URL` com essa URL ou o endereço interno correspondente.

O build gera `dist/client` e `dist/server/entry.mjs`. É necessário manter um processo Node ativo; enviar apenas arquivos HTML para hospedagem estática não executa SSR. Publicar o conteúdo completo de `dist` e as dependências de produção, ou uma imagem de execução equivalente. Usar Node compatível com o projeto (`>=22.23.4`; verificação executada com Node 24.13.0).

`bun run start` usa Node e carrega um `.env` local se existir. Em hospedagem, variáveis também podem ser injetadas pelo gerenciador do processo/container. Não publicar `.env` em diretório de assets. A LP e a API têm processos, variáveis e portas separados.

O canonical usa o domínio configurado no build e o caminho da página; query strings e o Host enviado pelo visitante não definem o domínio canônico. Conteúdo atualizado no banco aparece na próxima requisição, enquanto mudanças de componentes/assets ou de `SITE_ENV` exigem novo build.

## Verificação

```sh
bun test
bun run check
bun run build:qa
bun run test:ssr qa
bun run build:prod
bun run test:ssr production
```

`bun test`: treze testes do cliente, validação, timeout, limite de corpo, URLs e JSON-LD.

`bun run check`: Astro e TypeScript sem erros, avisos ou hints.

`test:ssr`: inicia um servidor de API simulado e o processo Node do build atual, testa HTTP e encerra os dois. Valida home/projeto, FAQ, SEO, canonical, indexação, CSS/fontes/imagens/scripts, atualização sem rebuild, 404, 503, recuperação e ausência da URL privada no HTML/JavaScript entregue. O argumento deve corresponder ao build existente. O teste não modifica o banco.

Além desses testes, home e projeto foram verificados contra a API local real e os dados importados no banco, sem alterar o conteúdo para essa verificação.

O devDependency `@emnapi/runtime@1.11.3` mantém o runtime WASM compatível com o verificador Astro. Sem essa resolução, o instalador selecionou uma versão beta 2.x incompatível com `@astrojs/astro2tsx`. Usar o `bun.lock` versionado ao instalar.

## Referências

- [Astro — adapter Node standalone](https://docs.astro.build/en/guides/integrations-guide/node/)
- [Astro — variáveis de ambiente no servidor](https://docs.astro.build/en/guides/environment-variables/)
