# LP + admin no Coolify

## O que muda em relação à configuração da imagem

A configuração atual usa **Railpack → Static → nginx:alpine**, com publicação de `/dist`. Ela serve somente os arquivos gerados pelo Astro. O admin Next.js, a API de leads e o worker precisam de Node em execução.

O `Dockerfile` da raiz prepara uma aplicação única, com três processos supervisionados e uma porta pública interna:

```text
Coolify / HTTPS
  └── Nginx :8080
        ├── /camelatto-design/                  → LP estática publicada
        └── /camelatto-design/admin/            → Next.js :3001
              ├── painel / login / mídia
              └── /api/public/leads             → banco MariaDB

Worker Node → snapshot imutável → build Astro → troca da versão servida
```

O endereço público continua sendo `https://demos.jlacode.com.br/camelatto-design/`. O painel fica em `https://demos.jlacode.com.br/camelatto-design/admin/login`.

O prefixo é lido de `site.config.mjs` pelo Astro, Next e configuração do Nginx. Para mudar o prefixo, altere esse arquivo, ajuste a rota no Coolify e faça um novo deploy de código.

## 1. Envie os arquivos para o repositório

O Coolify precisa receber o código do front, `admin/`, `deploy/`, `Dockerfile`, `.dockerignore` e `site.config.mjs`, além dos lockfiles. Arquivos locais não commitados não chegam ao servidor.

Não envie `.env`, `node_modules`, `.next`, `dist`, `.publish`, backups ou arquivos privados de `admin/storage`. O `.dockerignore` exclui esses arquivos da imagem. As credenciais reais entram pelas variáveis de execução do Coolify, sem serem copiadas para o build.

## 2. Ajuste o recurso atual

No recurso `camelatto-design`, altere o método de build:

| Campo | Valor |
| --- | --- |
| Build strategy / Build pack | **Dockerfile** |
| Base directory / contexto | `/` |
| Dockerfile location | `/Dockerfile` (arquivo na raiz do repositório) |
| Ports exposes | **8080** — substitui o 80 da imagem |
| Domínio | `https://demos.jlacode.com.br/camelatto-design` |
| Porta do domínio, se solicitada | `8080`, interna ao container |
| Path prefixes, em Advanced → Proxy | **Keep paths as-is** |
| Réplicas | Uma instância |
| Rolling updates | Desativado para esta implantação com volume local compartilhando as publicações |

Os campos de site estático, web server e publish directory de Railpack deixam de controlar o deploy. O Dockerfile já instala o Nginx, compila os dois projetos e define o comando de inicialização. Não configure um start command separado nem exponha a porta 3001 no host.

**Keep paths as-is é necessário:** o Nginx e o Next esperam receber `/camelatto-design/...` completo. Se o Coolify remover o prefixo, os caminhos não corresponderão à configuração.

O build usa Bun com o lockfile da LP e `npm ci` com o lockfile do admin. Usa Webpack no build do Next para evitar o bloqueio de estilos observado com Turbopack neste ambiente. O runtime continua sendo Node, sem necessidade de Bun para atender requisições.

## 3. Configure o armazenamento persistente

Em **Persistent Storage**, adicione um **Volume Mount** com:

| Campo | Valor |
| --- | --- |
| Destination Path | **`/data`** |
| Source Path | Deixe vazio para usar um volume gerenciado pelo Docker |

Essa única pasta contém:

```text
/data/
  storage/            # uploads e snapshot publicado
  backups/            # backups gerados pelo admin
  builds/             # snapshots e logs privados de compilação
  releases/<id>/
    public/           # somente os arquivos públicos de uma versão
    snapshot.json     # conteúdo privado da versão, fora de public/
  assets/             # arquivos Astro com hash, preservados entre versões
  current             # ponteiro para a versão pública ativa
```

O Nginx serve apenas `current` e os assets públicos. Ele não expõe a raiz de `/data`, snapshots, backups nem logs. A troca do ponteiro acontece depois que o novo build está completo. Assets com hash de versões anteriores continuam disponíveis para abas que já estavam abertas.

Não monte um volume em `/app`, `/app/dist` ou `node_modules`: isso ocultaria arquivos da imagem. O container usa o usuário `node`, UID/GID **1000**. Se preferir um bind mount, prepare a pasta do servidor com permissão de escrita para esse usuário.

Use uma instância deste recurso por volume. Persistência não substitui backup: inclua `/data/storage` e o banco na rotina de backup. Versões e logs antigos são mantidos; planeje retenção sem apagar `current` nem assets ainda utilizados.

## 4. Configure as variáveis de execução

Em **Environment Variables**, configure os valores de **runtime**, mantendo segredos fora das variáveis de build:

```dotenv
NODE_ENV=production
ADMIN_ORIGIN=https://demos.jlacode.com.br
LP_ORIGIN=https://demos.jlacode.com.br
ALLOWED_ORIGINS=https://demos.jlacode.com.br

DB_HOST=hostname-interno-do-mariadb
DB_PORT=3306
DB_USER=usuario-do-banco
DB_PASSWORD=senha-real-do-banco
DB_NAME=nome-do-banco

BETTER_AUTH_SECRET=segredo-estavel-com-pelo-menos-32-caracteres
PUBLICATION_SECRET=outro-segredo-estavel-com-pelo-menos-32-caracteres

DB_BOOTSTRAP_ON_START=false
```

`ADMIN_ORIGIN` e `LP_ORIGIN` contêm somente a origem, **sem `/camelatto-design` e sem `/admin`**. O prefixo vem do código.

Mantenha os segredos estáveis entre redeploys. Você pode usar os segredos já gerados no `.env` local, copiando seus valores diretamente para o Coolify. Nenhum valor real foi incluído neste documento ou no Dockerfile.

O banco deve ser alcançável pelo container. Se estiver no Coolify, use o hostname interno do serviço MariaDB e conecte os recursos à rede apropriada. `localhost` dentro do container aponta para a própria aplicação, não para seu computador nem para outro serviço de banco.

Os caminhos abaixo já são definidos na imagem e normalmente não precisam ser cadastrados novamente:

```dotenv
PUBLISH_RUNTIME_DIR=/data
STORAGE_PATH=/data/storage
BACKUP_PATH=/data/backups
```

Não configure `DEPLOY_WEBHOOK_URL` nesta arquitetura. O worker publica diretamente no volume servido pelo Nginx; não precisa chamar a API do Coolify nem ter um token de redeploy.

Também não é necessário configurar `PUBLIC_ADMIN_API_URL`: o formulário usa `/camelatto-design/admin/api/public/leads`, na mesma origem da LP.

### Banco atual ou banco novo

- **Se usar o mesmo banco já configurado e com as tabelas `ca_*`:** mantenha `DB_BOOTSTRAP_ON_START=false`. Usuários, senhas e conteúdo continuam nesse banco.
- **Se usar um banco novo e totalmente vazio:** defina `DB_BOOTSTRAP_ON_START=true` no primeiro deploy. O runtime cria as tabelas, salva o backup inicial e importa os JSON do portfólio. Esse modo não apaga nem recria tabelas existentes. Depois da primeira inicialização, pode voltar a `false`.
- **Se quiser migrar os dados locais:** restaure um backup em um banco vazio antes de conectar a aplicação a ele. O guia do admin descreve `db:backup` e `db:restore`. Não use uma nova importação como substituto da migração de usuários, leads e projetos reais.

O banco local não é enviado pelo Git ou pelo Dockerfile. Se também houver imagens já enviadas pelo painel, transfira os arquivos `.webp` correspondentes de `admin/storage` para `/data/storage` e preserve seus nomes; os metadados e referências estão no banco.

### SMTP e mídia

Para recuperar senha por e-mail, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` e `SMTP_FROM` no runtime. O serviço SMTP precisa ser validado com seu provedor.

O armazenamento local já usa `/data/storage`. Para usar S3, configure `STORAGE_DRIVER=s3` e os campos `S3_*` do `.env.example`; mantenha o bucket privado. A mídia passa pela API do admin, preservando o mesmo prefixo.

## 5. Healthcheck e deploy

Use a verificação definida no Dockerfile ou configure no Coolify:

| Campo | Valor |
| --- | --- |
| Método | `GET` |
| Porta interna | `8080` |
| Path | **`/healthz`** |
| Status esperado | `200` |
| Start period | `180` segundos, aumente se o servidor levar mais tempo para compilar a LP |

O healthcheck passa pelo Nginx e consulta o Next e as seções obrigatórias no banco. Falha de conexão ou schema incompleto retorna `503`, sem expor credenciais.

Faça o deploy e confira os logs de build e de execução. Na inicialização, o runtime consulta **a última versão efetivamente publicada** e recompila a LP com o código da nova imagem. Assim, um redeploy de código não troca os textos publicados pelos JSON originais do repositório. Rascunhos não entram nesse processo.

Se houver falha de compilação durante a preparação e já existir uma versão persistida, ela é preservada. Na primeira instalação, há um build inicial da imagem para servir a página enquanto a configuração do banco é concluída; o healthcheck continua indicando falhas de banco.

### Primeiro acesso em um banco novo

No **Terminal** do recurso, execute:

```sh
cd /app/admin
npm run admin:invite
cat /data/storage/first-access-url.txt
```

Abra o link privado exibido no seu terminal e crie seu administrador. Ele é de uso único e expira em uma hora. Se você reutilizou o banco atual, entre com o usuário já cadastrado.

Os comandos aceitam variáveis injetadas pelo Coolify; não é necessário criar um arquivo `.env` dentro do container.

## 6. Fluxo de uso depois de subir

1. Abra `/camelatto-design/admin/login`.
2. Edite e salve os projetos, textos, galeria e configurações.
3. Revise a prévia editorial e clique em **Publicar alterações**.
4. O worker lê o snapshot, compila o Astro, prepara os arquivos e troca a versão pública.
5. Quando o histórico mostrar **Publicado**, atualize a LP para conferir.

Não é necessário dar redeploy no Coolify para cada texto ou projeto. O **redeploy no Coolify fica para mudanças de código ou configuração**. O botão de publicação do admin atualiza o conteúdo.

O formulário de contato já usa a API do admin na mesma origem; contatos enviados pela LP entram em Leads. Imagens do painel são servidas pelo caminho de mídia do admin.

## Validação antes da produção

Na raiz:

```sh
npm run test:deploy
npm run build
npm --prefix admin run test:front
docker build -t camelatto-design .
```

O Dockerfile também executa os testes de deploy em Linux, incluindo a troca atômica de versões, valida a configuração com `nginx -t` e sobe um Nginx temporário para testar HTTP de verdade: LP, estudo de caso, assets, proxy do admin, envio de lead e bloqueio dos snapshots privados. Esse teste usa um backend simulado e não precisa de conexão com o banco de produção.

Com um arquivo **privado, fora do repositório**, de variáveis de produção ou teste, um volume e um banco alcançável:

```sh
docker run --rm --name camelatto-check -p 8080:8080 --env-file ../camelatto-runtime.env -v camelatto-data:/data camelatto-design
```

Para esse teste local por HTTP, configure `ADMIN_ORIGIN=http://localhost:8080` e `LP_ORIGIN=http://localhost:8080` no arquivo privado. Confira `/healthz`, a LP, login, envio de lead, upload e publicação. Reinicie o container e confirme que a versão publicada e as imagens continuam disponíveis.

Nesta máquina o cliente Docker está instalado, mas o daemon Docker Linux não estava disponível durante a preparação. Os testes de geração de configuração, preparação de versões e builds locais podem ser executados aqui; a imagem completa e o Nginx devem ser confirmados no Docker/Coolify antes de trocar o tráfego de produção.

Validações realizadas nesta entrega: build Next.js; build Astro pelo worker; dez testes do admin com integração HTTP; tipos e lint; teste isolado do front consumindo título, SEO, etapas, contato, FAQ e um novo slug vindos de snapshot; três testes locais de configuração/preparação de releases. O teste de troca atômica por symlink foi pulado no Windows e será executado pelo Dockerfile em Linux, junto do teste HTTP real do Nginx.

## Referências

- [Coolify: Dockerfile](https://coolify.io/docs/applications/builds/dockerfile) — contexto, porta interna, runtime e healthcheck.
- [Coolify: domínios e prefixos](https://coolify.io/docs/core/networking/domains) — roteamento por caminho e opção Keep paths as-is.
- [Coolify: armazenamento persistente](https://coolify.io/docs/applications/configuration/persistent-storage) — volumes e diretórios que sobrevivem a recriações do container.
