# Camelatto Studio — admin

Painel Next.js para administrar projetos, conteúdo da landing page e atendimento de leads. Usa o MariaDB configurado no `.env`, Prisma, Better Auth, Tailwind e a identidade visual da LP.

Para a configuração atual do Coolify, use o guia **[LP + admin no Coolify](../DEPLOY_COOLIFY.md)**. O Dockerfile da raiz reúne Nginx, Next e worker no mesmo recurso, com `/data` persistente e publicação do front pelo painel. As instruções de webhook abaixo continuam disponíveis para uma arquitetura externa separada.

## Iniciar localmente

Na raiz do repositório:

```sh
npm run dev
npm run admin:dev
```

Execute em terminais separados. O Astro encaminha as requisições do admin para a porta 3001. Acesse:

- LP: `http://localhost:4321/camelatto-design/`
- Admin: `http://localhost:4321/camelatto-design/admin/login`

Também é possível acessar o Next diretamente na porta 3001, com o mesmo caminho. Use uma única origem durante uma sessão para manter os cookies e callbacks de autenticação consistentes.

Quando `ADMIN_ORIGIN` aponta para localhost, ambas as portas locais (4321 e 3001) são permitidas pela autenticação e pelas APIs, inclusive com `npm start`. Uma instalação em domínio remoto permite apenas a origem configurada e as origens explicitamente listadas em `ALLOWED_ORIGINS`.

O prefixo foi centralizado em `site.config.mjs`, importado por `astro.config.mjs` e `admin/next.config.mjs`. Mudar `siteConfig.base` exige reiniciar os servidores e refazer os dois builds, pois o `basePath` do Next é definido no build. Links do Next recebem o prefixo automaticamente; chamadas `fetch`, imagens e APIs usam os helpers de caminho. O endpoint padrão do formulário é `<base>/admin/api/public/leads`.

## Banco e conteúdo inicial

Nesta implementação, a conexão confirmou MariaDB e o banco estava vazio. A estrutura `ca_*` foi criada e os JSON atuais foram importados. O `.env` original foi preservado, com adição dos segredos de autenticação e publicação.

Para uma instalação nova, dentro de `admin/`:

```sh
npm ci
npm run db:inspect
npm run db:setup
npm run content:import
```

`db:setup` salva backup antes de criar as tabelas e recusa reaplicar o schema se existirem tabelas `ca_*`. O SQL inicial está em `prisma/migrations/0001_initial/migration.sql`. Esse bootstrap aplica SQL diretamente; ele não cria histórico Prisma Migrate. Para evolução do schema, revisar o diff e fazer baseline antes de usar `prisma migrate deploy`.

`content:import` é idempotente: cria os registros ausentes sem sobrescrever edições existentes. Imagens locais da LP continuam disponíveis pelas chaves `mobile`, `web` e `research`.

## Primeiro administrador

Dentro de `admin/`:

```sh
npm run admin:invite
```

Abra o endereço salvo em `admin/storage/first-access-url.txt`. O formulário pede nome, e-mail e uma senha de pelo menos 12 caracteres. O link expira em uma hora, é de uso único e só funciona enquanto não houver usuários. Gere outro link se necessário; isso invalida o anterior. Não publique esse arquivo.

Alternativa por terminal: `npm run admin:user`, com `BOOTSTRAP_EMAIL`, `BOOTSTRAP_NAME` e `BOOTSTRAP_PASSWORD` definidos no ambiente do processo. O comando não exibe a senha, não aceita senha como argumento e não altera usuários existentes. Não há credencial padrão.

`BOOTSTRAP_PASSWORD` também pode estar no `admin/.env` e precisa ter de 12 a 128 caracteres. O comando valida a senha antes de pedir nome/e-mail; se ela for inválida, nenhum usuário é criado. Sem `BOOTSTRAP_EMAIL` e `BOOTSTRAP_NAME`, esses dados são solicitados no terminal. O cadastro só está concluído quando aparecer a confirmação de que o administrador foi salvo no banco.

Os próximos usuários são criados em **Usuários e acesso**:

- Administrador: todo o painel.
- Editor: projetos, conteúdo, mídia, revisões e publicação.
- Atendimento: leads, tarefas e CSV; sem acesso aos rascunhos.

Todas as APIs conferem o perfil no servidor. Alterar o perfil ou revogar sessões encerra os acessos ativos do usuário. Não é permitido remover o último administrador.

## Edição e publicação

1. Edite projetos e seções; salve o rascunho.
2. Confira a prévia editorial privada. Ela verifica o conteúdo salvo; o layout público é renderizado pelo Astro.
3. Marque os projetos que podem aparecer no site como publicados. Escolha até três posições de destaque sem repetir posições.
4. Em **Publicação**, crie uma versão. O snapshot dessa versão é imutável.
5. Mantenha o worker ativo, em outro terminal:

```sh
npm run admin:worker
```

O worker compila o Astro em uma pasta isolada usando o snapshot escolhido. Só depois de um build bem-sucedido promove o diretório completo para `dist/` e atualiza `admin/storage/published.json`. O build anterior fica preservado em `.publish/<id>/previous-dist`. Um watcher dedicado reinicia o Astro em desenvolvimento ao promover o snapshot, invalidando também o cache das rotas de novos projetos. Para conferir exatamente o site compilado, use `npm run preview` na raiz. Com `STORAGE_PATH` personalizado, configure `CONTENT_SNAPSHOT_FILE` no ambiente do Astro e adapte o watcher ao mesmo diretório.

O worker mantém um lock exclusivo do MariaDB durante a compilação para impedir concorrência entre processos. Após um reinício, trabalhos de compilação interrompidos são marcados como falha quando o novo worker adquire esse lock; podem ser repetidos pelo painel. Restaurar uma versão cria outra publicação com o conteúdo daquela versão.

O dashboard mostra dados reais. As estatísticas de exibições/avaliações da seção Sobre são campos manuais, separados dos indicadores comerciais. O Kanban tem paginação explícita e mostra os contatos da página de resultados atual.

### Produção

A promoção local só atualiza o `dist/` deste servidor. Se a hospedagem da LP serve esse diretório, esse é o fluxo de publicação. Caso a hospedagem use outro servidor ou pipeline, configure `DEPLOY_WEBHOOK_URL` e `DEPLOY_WEBHOOK_TOKEN`; nesse modo o worker aguarda a confirmação externa, em vez de afirmar que o site já foi atualizado.

O webhook recebe `{ publicationId, sequence }`. O pipeline deve buscar o snapshot exato em `<base>/admin/api/public/content?snapshot=<id>` usando `Authorization: Bearer <PUBLICATION_SECRET>`, gravá-lo em um arquivo e executar o build Astro com `CONTENT_SNAPSHOT_FILE` apontando para esse arquivo. Faça o deploy atômico dos artefatos antes de confirmar a publicação.

O callback é um `POST <base>/admin/api/publication-callback` com corpo JSON `{ publicationId, status: "published" | "failed", timestamp }`, em que `timestamp` é Unix em milissegundos. Envie `X-Publication-Signature` com o HMAC SHA-256 em hexadecimal do **corpo bruto exato**, usando `PUBLICATION_SECRET`. A assinatura expira após cinco minutos. Callbacks repetidos não alteram publicações finalizadas. O pipeline também deve serializar as promoções e impedir que uma versão antiga sobrescreva uma mais recente.

Não use a URL pública sem identificador durante um build de publicação: ela retorna apenas a última versão confirmada, nunca um rascunho.

## Leads

O formulário da LP valida os campos no navegador e no servidor. Mantém os campos em caso de erro e reutiliza a chave de idempotência em retentativas. Apenas um envio persistido recebe sucesso; o mesmo envio não gera outro lead. Contatos posteriores com o mesmo e-mail ficam preservados e sinalizados como possível duplicidade.

O painel oferece busca, filtros de origem/serviço/tag/data/responsável/etapa, tabela e Kanban, operações em lote, notas, histórico, responsável, orçamento, motivo de perda, prazos, tarefas e exportação da ficha. A anonimização é exclusiva de administradores e remove dados pessoais, notas e tarefas.

Importação: CSV com cabeçalhos `name,email,phone,company,service,message`, separador vírgula ou ponto e vírgula, até 500 linhas e 500 KB. Há prévia e relatório de erros antes da confirmação. E-mails já cadastrados são ignorados. Exportação respeita os filtros e tem limite de 10 mil linhas por arquivo; divida períodos maiores pelos filtros de data. Células que podem virar fórmulas são neutralizadas.

Links de e-mail e WhatsApp abrem o aplicativo correspondente; não enviam mensagens automaticamente. O painel não presume que um clique de WhatsApp seja um lead identificado.

O aviso inicial de privacidade é editável em **Conteúdo da LP → Contato e formulário**. Revise o texto e a política de retenção antes do uso em produção. O aceite de marketing é opcional e separado do pedido de contato.

## Hospedagem e configuração

O Next precisa de runtime Node persistente. Execute `npm run admin:build` e, em `admin/`, `npm start`. Mantenha o worker sob o gerenciador de processos da hospedagem.

Configure um proxy reverso **antes** da regra de arquivos estáticos da LP:

```nginx
# Exemplo para o prefixo atual; ajuste se alterar site.config.mjs.
location /camelatto-design/admin/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    client_max_body_size 11m;
}
```

Preserve o caminho completo ao encaminhar ao Next. Sobrescreva o IP encaminhado no proxy de confiança para não permitir que um cliente contorne o limite de envios com um cabeçalho forjado. Aplique também limites de requisições/conexões na borda. Use HTTPS e configure `ADMIN_ORIGIN` com a origem real, sem o caminho, e `ALLOWED_ORIGINS` com as origens permitidas separadas por vírgula.

Se a API estiver em outra origem, defina `PUBLIC_ADMIN_API_URL` no ambiente do build Astro com o endpoint completo e configure CORS no admin. Essa variável é pública; nunca coloque segredos nela.

Mídia local: requer disco persistente em `admin/storage` ou `STORAGE_PATH`. As imagens são reprocessadas em WebP e os nomes são gerados no servidor. Imagens locais ainda não referenciadas na última publicação exigem sessão para serem lidas.

S3: configure `STORAGE_DRIVER=s3` e os campos `S3_*` do `.env.example`. Mantenha o bucket privado. O admin faz a leitura com credenciais do servidor e aplica à mídia a mesma regra de acesso de rascunho/publicação do driver local; não é necessário expor uma URL pública do bucket. Se a LP estiver em outra origem, configure também o proxy para o caminho das mídias ou use URLs absolutas do admin no conteúdo.

E-mail transacional: configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` e `SMTP_FROM` para habilitar recuperação de senha. Sem SMTP a interface informa que a recuperação ainda não está disponível.

## Backups e restauração

```sh
# Dentro de admin/
npm run db:backup
```

O backup JSON privado contém schema e dados, inclusive hashes de senha e sessões. A leitura usa um snapshot transacional consistente. Proteja-o e mantenha cópias fora do servidor. Inclua também mídia/storage e os segredos necessários na rotina de backup. Não envie esses arquivos ao Git.

Para restaurar, aponte o `.env` de uma instalação isolada para um **banco vazio** e execute:

```sh
npm run db:restore -- backups/database-ARQUIVO.json --confirm-empty-database
```

A ferramenta recusa bancos com tabelas existentes e backups que contenham tabelas fora do prefixo `ca_`. Ela não apaga o banco de produção. Teste a restauração em uma instância isolada e confira contagens, login e imagens antes de mudar a conexão de produção. Agendamento de backups e regras de retenção dependem do ambiente de hospedagem.

## Validação

```sh
# Dentro de admin/
npm run typecheck
npm run lint
npm run test
npm run build
```

Os testes de integração HTTP são ativados com `TEST_BASE_URL=http://localhost:3001` e o Next em execução. Criam usuários/contatos/projetos temporários com identificadores exclusivos e removem apenas esses registros ao terminar. Testam login, perfis, conflito de edição, rascunho privado, envio idempotente, notas, tarefas, exportação CSV e bloqueio de origem. Execute em ambiente de desenvolvimento, sem o worker consumindo a fila de teste.

Na raiz, `npm run build` valida a LP. A validação visual usa a aplicação no navegador em desktop e mobile. Serviços de produção como SMTP, S3 e webhook só podem ser validados depois de configurados no ambiente real.

### Verificações executadas nesta entrega

- Build Next.js e lint: aprovados, sem erros ou avisos na execução final.
- Build Astro: aprovado, inclusive pelo worker de publicação.
- `TEST_BASE_URL=http://localhost:4321 npm run test`: seis testes aprovados, incluindo integração através do proxy e do prefixo real. Login/perfis, conflito, rascunho privado, mídia privada, idempotência, notas, tarefas e CSV verificados.
- `scripts/test-publication.ts`: publicação local e falha simulada; build e snapshot anteriores preservados na falha.
- `scripts/test-restore.ts`: backup restaurado em banco isolado, contagens das 17 tabelas conferidas e banco temporário removido.
- `npm audit`: zero vulnerabilidades após atualização das dependências transitivas fixadas por overrides.
- Conferência visual: desktop em 1440 px e mobile em 390 px; tabelas rolam dentro do painel sem alargar a página.

No Windows, encerre o Next e o worker antes de executar `npm ci` ou gerar o Prisma Client se o sistema informar bloqueio do arquivo de engine. As pastas de builds temporários, `dist/` e `admin/` ficam fora do watcher geral do Astro; a publicação tem um watcher específico para o snapshot.
