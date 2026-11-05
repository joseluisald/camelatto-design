# Planejamento do admin — Camelatto Design

## Objetivo e escopo

Construir uma aplicação Next.js dentro de `admin/` para administrar projetos, os textos e configurações da landing page e o ciclo completo de atendimento dos leads. Reutilizar cores, fontes e identidade visual da LP.

Este documento registra o planejamento original e o backlog. A implementação local foi realizada em 04/11/2026: Next.js em `admin/`, autenticação, banco MariaDB, editores, leads e publicação estão disponíveis. O arquivo `admin/.env` foi preservado e recebeu os segredos necessários. Consulte `admin/README.md` para executar e configurar produção; os itens abaixo descrevem o escopo planejado, não uma certificação de serviços externos já configurados.

## Estado da entrega local

- Next.js 16, Prisma, Better Auth e Tailwind instalados com versões fixadas.
- MariaDB 12.3.3 confirmado; banco inicialmente vazio, backup inicial e 17 tabelas `ca_*` criadas.
- Conteúdo existente importado sem sobrescrever registros; gestão de projetos, seções da LP, mídia, revisões e prévia editorial privada.
- Leads com formulário na LP, idempotência, tabela, Kanban, filtros, notas, responsáveis, tarefas, CSV e anonimização.
- Perfis de administrador, editor e atendimento verificados nas APIs.
- Snapshot imutável, worker, build isolado, promoção local de `dist/`, repetição e restauração de versões.
- Prefixo compartilhado entre Astro e Next; proxy HTTP/WebSocket de desenvolvimento, cookies e redirecionamentos ajustados ao `base`.
- Testes unitários e de integração HTTP aprovados; publicação e preservação da versão anterior sob falha verificadas.
- Backup restaurado em banco temporário separado e contagens das 17 tabelas conferidas.
- Interface conferida em desktop e mobile; builds Astro/Next e lint aprovados.
- Produção: domínio/proxy, execução contínua do worker, SMTP, S3 opcional e pipeline externo dependem da configuração da hospedagem. SMTP/S3/webhook não foram apresentados como validados em produção.

A implementação usa formulários React controlados e validação Zod no servidor, em vez de adicionar React Hook Form. O schema efetivo está em `admin/prisma/schema.prisma`; alguns dados editoriais e tags são armazenados como JSON validado. A prévia é editorial; o layout público final é produzido pelo build Astro.

## Situação da LP antes da implementação

- Astro com Alpine.js, Tailwind CSS e geração estática; Next.js não está instalado.
- `src/data/portfolio.json`: navegação, hero, projetos, abordagem, galeria, sobre e contato.
- `src/data/settings.json`: nome, title, description, keywords, links sociais, WhatsApp e GTM.
- `src/data/faq.json`: perguntas e respostas.
- `src/utils/data.ts`: leitura dos arquivos locais e tipos inferidos do JSON.
- `src/utils/project-images.ts`: imagens locais mapeadas por chaves fixas.
- `src/pages/projetos/[slug].astro`: páginas de estudo de caso geradas no build.
- `src/components/site/Contact.astro`: links de contato; ainda não há formulário nem persistência de leads.
- A vitrine mostra três celulares, enquanto os seletores percorrem todos os projetos. A integração deverá usar a mesma lista de até três destaques em ambos.
- O caminho público atual é `/camelatto-design`; links, imagens, formulário e publicação devem respeitar esse prefixo configurável.
- O `.env` tem `NODE_ENV`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` e `DB_NAME`. Esses nomes não comprovam o mecanismo ou a versão do banco; validar antes de escolher o driver.

## Stack proposta

| Camada | Escolha e finalidade |
| --- | --- |
| Admin | Next.js com App Router, React e TypeScript; aplicação independente da LP |
| Interface | Tailwind CSS e componentes acessíveis, com tokens da identidade existente |
| Backend | Server Actions para mutações internas e Route Handlers para APIs |
| Banco | Prisma ORM; confirmar banco/versão e selecionar conector e adapter compatíveis |
| Autenticação | Biblioteca mantida compatível com Next.js; sessões persistidas, login por e-mail e senha e recuperação de acesso |
| Formulários | React Hook Form e Zod, com validação repetida no servidor |
| Mídia | Storage persistente compatível com S3, privado para originais e com URLs públicas apenas para arquivos publicados |
| Qualidade | Lint, verificação TypeScript, build e testes dos fluxos de autenticação, publicação e leads |

Fixar versões estáveis compatíveis no início da implementação e usar um único gerenciador de pacotes no admin. Conferir a versão de Node exigida pelas dependências e pelo ambiente de hospedagem.

Se o banco existente for MySQL/MariaDB, configurar o respectivo conector Prisma. Montar a conexão apenas no servidor a partir das variáveis existentes, com escaping das credenciais quando necessário. Não colocar credenciais em variáveis `NEXT_PUBLIC_*`, no bundle da LP, em respostas da API ou nos logs.

## Identidade visual e navegação

Copiar os valores dos tokens de `src/styles/global.css` para uma fonte compartilhável, sem importar estilos globais da LP que afetem o painel:

| Token | Valor atual |
| --- | --- |
| Destaque vinho | `#8f1b41` |
| Fundo creme | `oklch(0.975 0.006 85)` |
| Texto | `oklch(0.2 0.008 60)` |
| Texto secundário | `oklch(0.51 0.013 65)` |
| Bordas | `oklch(0.89 0.01 75)` |
| Superfície | `oklch(0.955 0.01 85)` |
| Fontes | Instrument Sans, Bricolage Grotesque e JetBrains Mono |

Usar menu lateral no desktop, navegação recolhível no mobile, cabeçalho com ações da tela e estados claros de carregamento, vazio, erro e sucesso. Formulários devem ter labels, erros por campo, indicação de alterações não salvas e foco visível. Cores de status devem vir acompanhadas de texto.

Rotas propostas, relativas ao domínio do admin:

- `/login`, `/recuperar-acesso`, `/redefinir-senha`.
- `/`: dashboard.
- `/projetos`, `/projetos/novo`, `/projetos/[id]`.
- `/leads`, `/leads/[id]`, `/tarefas`.
- `/conteudo`: hero, navegação, abordagem, sobre, contato, FAQ e rodapé.
- `/galeria`, `/midia`, `/configuracoes`, `/usuarios`, `/auditoria`.

## Projetos

CRUD com busca, filtros por categoria/status, paginação, duplicação, arquivamento e confirmação para exclusão definitiva. Separar o identificador interno do número de exibição, atualmente `01`, `02` e `03`.

Campos:

- Título (`title`), descrição (`description`), slug único, categoria e ano.
- Participação no projeto (`contribution`), tags e etapas específicas do projeto.
- Desafio, processo, solução e resultados; permitir seções estruturadas e links externos opcionais.
- Capa, imagem dos celulares, galeria e texto alternativo por imagem.
- Metadados SEO: título, descrição e imagem de compartilhamento.
- Status: rascunho, publicado ou arquivado; data de publicação, ordem e posição de destaque.

Permitir selecionar e ordenar até três projetos publicados em destaque. Cada celular deve usar a mídia e os dados do projeto, com alternativa visual quando não houver imagem. Mostrar prévia da LP e do estudo de caso antes de publicar. Validar campos obrigatórios na publicação, preservar rascunhos incompletos e registrar revisões. Mudanças de slug de projetos publicados devem manter redirecionamento da URL anterior.

## Títulos, descrições e conteúdo completo da LP

- Hero: título, destaque, descrição, CTAs, links e tema do banner existente.
- Projetos: título da seção e seleção/ordenação dos destaques.
- Abordagem: título, descrição e etapas ordenáveis.
- Sobre: título, parágrafos, imagem, habilidades e estatísticas; números manuais identificados como tal.
- Galeria: categorias, imagens, títulos, alternativas textuais e ordenação.
- Contato: título, destaque, descrição, formulário e links.
- FAQ: perguntas, respostas, ordem e visibilidade.
- Configurações: identidade, função, localização, redes sociais, currículo, e-mail e WhatsApp.
- SEO global: `title`, `description`, keywords, imagem social, URL canônica e indexação.
- Navegação, rodapé e crédito do desenvolvedor conforme os campos existentes.

Campos de texto devem ser estruturados; não aceitar scripts ou HTML arbitrário. Para conteúdo formatado, usar editor limitado com sanitização no servidor. Separar salvar rascunho, visualizar e publicar, com histórico e restauração de versões.

## Leads: captação e atendimento

### Entrada pela LP

Adicionar formulário acessível com nome, e-mail, telefone/WhatsApp opcional, empresa opcional, serviço de interesse e mensagem. Registrar origem, página de entrada, projeto de interesse e UTMs quando disponíveis, aplicando limites de tamanho e validação. Exibir aviso de privacidade junto ao envio; registrar a versão do aviso e eventual consentimento de marketing separado, opcional e desmarcado por padrão. A definição jurídica do texto e da retenção será uma etapa própria antes de publicar.

O `POST /api/public/leads` deve validar no servidor, limitar tentativas, usar honeypot e impedir duplicação por repetição do mesmo envio com chave de idempotência. Retornar sucesso somente após persistir o lead. Retentativas com a mesma chave não geram registros extras; novos contatos da mesma pessoa preservam as mensagens e sinalizam possível duplicidade. Oferecer nova tentativa sem perder os campos em caso de erro.

Cliques em WhatsApp são eventos de interesse; só criar lead identificado quando houver dados de contato enviados ou integração que efetivamente os forneça.

### Gestão no painel

- Listagem e quadro Kanban com fases: novo, em contato, qualificado, proposta enviada, ganho e perdido; spam e arquivado ficam fora do funil comercial.
- Ficha com contatos, mensagens, serviço, projeto associado, origem, UTMs, responsável, prioridade, orçamento estimado, prazo e motivo de perda.
- Linha do tempo de mudanças, notas internas, contatos e tarefas.
- Busca por nome, e-mail, telefone e empresa; filtros combináveis por data, responsável, etapa, serviço, origem e tags.
- Alteração individual e em lote de responsável, status e tags, com permissões e histórico.
- Tarefas com vencimento, lembretes no painel e fila de próximos acompanhamentos.
- Links para abrir e-mail/WhatsApp; envio integrado e sincronização de mensagens exigem provedor próprio e ficam para uma fase posterior.
- Importação CSV com prévia, validação, relatório de erros e tratamento de duplicados; exportação respeitando filtros e permissões.
- Exportações CSV devem neutralizar células que possam ser interpretadas como fórmulas.
- Arquivamento, exclusão/anônimização conforme política de retenção, exportação individual e registro dessas operações.

### Indicadores

Mostrar novos leads por período/origem, distribuição por etapa, tempo até o primeiro contato e tarefas vencidas. Registrar `firstContactAt` e transições para calcular esses indicadores. Diferenciar ganho/total de leads e ganho/oportunidades encerradas; exibir a fórmula aplicada. Métricas de visitantes e conversão da LP só entram quando existir fonte de analytics integrada; não gerar números simulados.

## Modelo de dados inicial

Todas as entidades mutáveis devem ter identificador, datas de criação/atualização e índices adequados. Usar datas em UTC e exibir em `America/Sao_Paulo`.

| Entidade | Responsabilidade e relações |
| --- | --- |
| User / Session / PasswordReset | Usuários, papéis, sessões revogáveis e tokens de recuperação com expiração |
| Project / ProjectRevision | Dados dos projetos e snapshots editoriais; slug único |
| ProjectSlugRedirect | Slug anterior apontando para o projeto publicado |
| Tag / ProjectTag | Tags reutilizáveis e relação com projetos |
| Media / ProjectMedia | Arquivo, chave do storage, tipo, tamanho, dimensões, alt e ordem |
| PageSection / ContentRevision | Seções tipadas, dados validados e revisões |
| SiteSettings | Configurações globais e SEO, sem segredos de infraestrutura |
| GalleryItem / FaqItem | Conteúdo ordenável e estado de publicação |
| Lead | Contato, responsável, fase, origem, primeiro contato e metadados de privacidade |
| LeadMessage / LeadEvent / LeadNote | Mensagens recebidas, histórico e observações internas |
| LeadTag | Tags por lead |
| Task | Acompanhamento associado a lead/usuário e prazo |
| Submission | Chave idempotente única e resultado de cada envio |
| Publication / PublicationJob | Snapshot público, status do build, tentativas e URL da versão |
| AuditLog | Autor, ação, entidade e alterações sem credenciais ou dados pessoais desnecessários |

Adicionar índices para slug, status/ordem dos projetos, e-mail normalizado, telefone normalizado, etapa/data/responsável dos leads e vencimento das tarefas. Relações de exclusão devem preservar histórico necessário; não apagar mídias referenciadas nem propagar exclusões indevidas.

## Integração entre Next.js e Astro

Manter a LP em Astro e o admin em Next.js. Como o site atual é estático, apenas salvar no banco não atualiza o HTML publicado.

### Estratégia inicial: publicação com build

1. Salvar alterações como rascunho no banco.
2. Ao publicar, validar o conteúdo e criar um snapshot público imutável e um trabalho na fila.
3. O pipeline autorizado busca esse snapshot por identificador, usando credencial de serviço mantida no servidor.
4. Substituir a leitura direta dos JSON em `getSettings()` por uma camada de conteúdo tipada. Migrar também imports diretos como o de `Projects.astro` e tipos hoje inferidos do JSON para contratos independentes.
5. Adaptar `getStaticPaths()` para os projetos publicados e resolver imagens remotas do storage em lugar das chaves locais fixas. Manter o limite e a ordem dos três destaques consistentes.
6. Executar o build Astro e publicar os artefatos de forma atômica, respeitando `BASE_URL`.
7. Exibir estados na fila: aguardando, compilando, publicado e falhou, com horário, erro resumido e nova tentativa. Salvar e publicar são estados diferentes.

O build usa um único snapshot para evitar conteúdo misturado entre revisões. Se falhar, a versão pública anterior continua servida; retentativas devem ser idempotentes e publicações concorrentes não podem sobrescrever uma versão mais recente. Reverter significa publicar novamente um snapshot anterior.

A captação de leads é dinâmica e vai para o Next.js, independente do build. Preferir proxy da hospedagem para `/api/public/leads` na origem da LP. Se o admin ficar em outro domínio, configurar a URL pública do endpoint e CORS restrito à origem da LP; aplicar proteção antiabuso também no servidor, pois CORS não impede requisições externas.

Alternativa futura: Astro sob demanda com adapter e cache, caso seja necessário publicar conteúdo imediatamente e a hospedagem suporte runtime. Isso exige uma alteração explícita na infraestrutura atual.

## Acesso, operação e segurança

- Papéis: administrador (usuários/configurações), editor (conteúdo/projetos) e atendimento (leads/tarefas). Validar permissões no servidor em todas as operações, inclusive leitura, exportação e APIs.
- Primeiro administrador criado por comando de bootstrap seguro, sem cadastro público e sem senha padrão. Usar hash de senha apropriado, cookies HttpOnly/Secure/SameSite, expiração, logout e revogação de sessões.
- Recuperação por tokens de uso único e expiração, sem revelar se o e-mail existe. Configurar serviço transacional antes de ativar esse fluxo.
- Proteger mutações contra CSRF, validar origem quando aplicável, limitar login/formulário e remover dados sensíveis dos erros e logs.
- Uploads com limite de tamanho, validação do conteúdo real, nomes gerados no servidor e formatos de imagem permitidos; não servir arquivos executáveis enviados pelo usuário.
- Preservar `.env`, ampliar ignore para `.env*` com exceção de `.env.example` e documentar apenas nomes/valores fictícios. Nunca executar migrations destrutivas automaticamente no banco existente.
- Antes da primeira migration: identificar mecanismo/versão, listar estrutura existente com acesso de leitura, separar ambiente de desenvolvimento e obter backup. Rever SQL e eventuais conflitos de tabelas antes de aplicar.
- Backups do banco e storage com teste de restauração, logs operacionais, monitoramento de erro e política de retenção para leads e backups.
- Admin fora de indexação; autenticação continua sendo a proteção efetiva.

## Estrutura sugerida

```text
admin/
  .env                     # existente, privado
  .env.example             # somente exemplos sem credenciais reais
  PLANEJAMENTO.md
  package.json
  prisma/
    schema.prisma
    migrations/
  src/
    app/
      (auth)/
      (dashboard)/
      api/public/leads/
      api/public/content/
    components/
    features/              # projetos, conteúdo, leads, publicação
    lib/                   # auth, db, env, storage, permissions
    contracts/             # schemas versionados de integração com Astro
  scripts/                 # bootstrap, importação e publicação
  tests/
```

O endpoint de conteúdo deve expor apenas snapshots publicados; previews de rascunhos exigem autenticação/token temporário e não devem ser indexáveis. Não incluir dados de leads ou usuários no payload público.

## Etapas de execução e critérios de aceite

### 1. Fundação e banco

- [ ] Confirmar mecanismo/versão do banco, estrutura existente e hospedagem Node do admin.
- [ ] Criar Next.js em `admin/` preservando `.env`, aplicar tokens visuais e configurar lint, tipos e build.
- [ ] Configurar validação de ambiente, ORM, migrations revisadas e backup.
- [ ] Implementar bootstrap, login, recuperação, sessões e permissões.
- [ ] Aceite: usuário anônimo não acessa dados; cada papel recebe somente os acessos previstos.

### 2. Conteúdo e projetos

- [ ] Implementar CRUD, mídia, revisões, SEO, editor das seções e configuração da LP.
- [ ] Criar importador idempotente dos JSON atuais, preservando IDs visíveis, slugs e conteúdo.
- [ ] Implementar rascunhos, prévia e seleção de até três destaques.
- [ ] Aceite: editar título/descrição e salvar não altera o site antes da publicação; validar todos os campos atuais sem perda de conteúdo.

### 3. Publicação da LP

- [ ] Criar contratos, snapshots, fila e integração segura com pipeline de build.
- [ ] Migrar leitura de conteúdo, rotas de projetos, imagens e prefixo de URLs no Astro.
- [ ] Implementar estado de publicação, repetição de trabalhos e restauração de versão.
- [ ] Aceite: projeto publicado aparece na LP e no estudo de caso; rascunho fica privado; falha de build mantém a versão anterior.

### 4. Leads completos

- [ ] Criar formulário, endpoint, validação, proteção antiabuso e persistência idempotente.
- [ ] Implementar listagem, Kanban, ficha, responsáveis, tags, histórico e tarefas.
- [ ] Adicionar importação/exportação e métricas baseadas em dados reais.
- [ ] Aceite: um envio válido aparece uma vez no painel; repetir o mesmo envio não duplica; filtros, tarefas e transições mantêm histórico; falhas permitem tentar novamente.

### 5. Entrega e operação

- [ ] Validar dashboard e formulários em desktop/mobile, navegação por teclado e contraste.
- [ ] Testar autenticação/permissões, recuperação, upload inválido, vazamento de rascunhos, leads duplicados e publicação concorrente/com falha.
- [ ] Rodar lint, tipos, build Next.js, build Astro e testes de integração com banco de teste isolado.
- [ ] Configurar produção, storage, e-mail transacional, backups, monitoramento e guia de operação.
- [ ] Aceite: fluxo completo de editar → visualizar → publicar → captar → atender lead validado; restauração de backup exercitada.

## Backlog de implementação

As entregas abaixo detalham as etapas anteriores. Cada item só deve ser marcado como concluído depois de implementar e validar seu critério de aceite. Dependências externas devem ficar registradas como pendências; uma tela pronta não significa que o fluxo está integrado.

| Ordem | Entrega | Depende de | Resultado verificável |
| --- | --- | --- | --- |
| A01 | Estruturar Next.js, TypeScript, scripts e layout visual | Nenhuma | Admin inicia separado da LP e passa em build e tipos |
| A02 | Validar ambiente e identificar banco existente | Nenhuma | Driver definido sem expor credenciais; diagnóstico não altera tabelas |
| A03 | Modelar banco e preparar migration inicial/importador | A02 | SQL revisado, aplicado em banco de desenvolvimento e importação repetível sem duplicação |
| A04 | Login, sessões, recuperação e papéis | A01, A03, serviço de e-mail para recuperação | Acesso anônimo bloqueado e permissões testadas no servidor |
| A05 | Cadastrar, editar, listar e arquivar projetos | A04 | Título, descrição e demais campos persistem; filtros e paginação funcionam |
| A06 | Upload, seleção de mídia e ordenação dos destaques | A05, storage | Arquivos válidos persistem e até três destaques têm ordem consistente |
| A07 | Editor das seções, configurações, galeria e FAQ | A04 | Campos existentes da LP são editáveis sem perda na importação |
| A08 | Revisões, prévia e snapshot de publicação | A06, A07 | Rascunhos ficam privados e versão anterior pode ser restaurada |
| A09 | Adaptar Astro e integrar publicação | A08, pipeline de hospedagem | Publicação atualiza a LP; falha mantém a versão pública anterior |
| A10 | Formulário público e API de leads | A03, URL pública do backend | Envio válido persiste uma vez e falha oferece nova tentativa |
| A11 | Gestão de leads e tarefas | A04, A10 | Atendimento atualiza etapa, responsável e notas com histórico |
| A12 | Kanban, operações em lote e CSV | A11 | Movimentação, importação e exportação respeitam filtros e permissões |
| A13 | Dashboard com dados reais | A05, A11 | Contagens e indicadores correspondem aos registros e fórmulas exibidas |
| A14 | Validação integrada e operação | A09, A12, A13 | Fluxos essenciais passam, backup é restaurável e documentação permite operar o painel |

### Primeira entrega funcional

Priorizar A01–A05: painel com a identidade da LP, acesso autenticado e gestão real de projetos no banco. Esse marco permite validar a fundação e o editor de título/descrição antes das integrações de mídia e publicação. A interface deve informar que alterações salvas ainda não estão publicadas.

Na sequência, concluir A06–A09 para permitir administrar e publicar a LP completa. A10 pode avançar assim que o banco estiver preparado; A11–A13 completam o atendimento e os indicadores. A14 fecha a entrega do escopo completo, incluindo dependências de produção.

### Detalhamento das telas principais

| Tela | Conteúdo e ações | Estados obrigatórios |
| --- | --- | --- |
| Dashboard | Resumo de projetos, última publicação, leads por fase e tarefas vencidas; atalhos para registros reais | Sem registros, carregamento e falha de consulta |
| Projetos | Busca, filtros, status, ordem, capa e ações de criar/editar/duplicar/arquivar | Lista vazia, nenhum resultado e erro de operação |
| Editor de projeto | Dados básicos, estudo de caso, mídia, SEO e publicação; salvar rascunho e abrir prévia | Erros por campo, alterações não salvas e conflito de edição |
| Conteúdo da LP | Navegação por seção, campos estruturados, revisão e prévia | Seção vazia, rascunho salvo e erro de validação |
| Leads | Alternância entre tabela e Kanban, busca, filtros, seleção e ações em lote | Nenhum lead, nenhum resultado e falha ao mudar etapa |
| Ficha do lead | Dados de contato, mensagem original, histórico, notas, tarefas e responsável | Lead arquivado, possível duplicidade e acesso insuficiente |
| Publicação | Revisão a publicar, histórico, progresso, falha e repetição de trabalho | Sem publicação, em andamento, concluída e falhou |
| Configurações | Identidade, contatos, SEO e usuários conforme o papel | Campos inválidos, acesso insuficiente e confirmação de gravação |

Para conflitos de edição, enviar a revisão ou `updatedAt` lido pelo formulário e verificar novamente na gravação. Se outro usuário tiver alterado o registro, impedir sobrescrita silenciosa e oferecer recarregar os dados mantendo uma cópia local do texto editado.

### Contratos de integração a fechar antes do desenvolvimento

- Conteúdo: payload versionado com configurações, seções, FAQ, galeria e projetos publicados; datas em ISO 8601 e mídia com URL e texto alternativo. Usar o mesmo schema para validar a resposta no admin e a entrada do build Astro.
- Publicação: identificar snapshot e trabalho; autenticar gatilho e retorno do pipeline, validar transições de estado e rejeitar callbacks duplicados ou referentes a versões obsoletas.
- Leads: corpo com dados do formulário, origem, aviso de privacidade e chave de idempotência; respostas distinguem validação, limite de tentativas, sucesso e indisponibilidade sem expor detalhes internos.
- Listagens: paginação e filtros validados no servidor; ordenar de forma estável com critério de desempate por identificador.
- Mídia: salvar chave do objeto e metadados; não depender de caminho temporário ou disco efêmero da hospedagem.

### Matriz mínima de permissões

| Operação | Administrador | Editor | Atendimento |
| --- | --- | --- | --- |
| Gerenciar projetos, conteúdo e mídia | Sim | Sim | Não |
| Visualizar rascunhos e publicar conteúdo | Sim | Sim | Não |
| Consultar e atualizar leads/tarefas | Sim | Não | Sim |
| Importar e exportar leads | Sim | Não | Sim |
| Excluir/anônimizar dados de leads | Sim | Não | Não |
| Gerenciar usuários e configurações globais | Sim | Não | Não |
| Consultar auditoria global | Sim | Não | Não |

O editor pode alterar textos de SEO e contato pelos formulários de conteúdo; gestão de usuários e segredos de infraestrutura não faz parte desse acesso. Segredos permanecem nas variáveis de ambiente da hospedagem.

### Evidências para encerrar a implementação

- Registrar os comandos de validação e seus resultados no guia de entrega.
- Demonstrar criação e edição de um projeto, prévia privada, publicação e navegação para o estudo de caso.
- Demonstrar um envio pela LP, retentativa com a mesma chave e atendimento do lead no painel com tarefa e histórico.
- Conferir isolamento entre os três papéis por requisições ao servidor, além de testar a navegação da interface.
- Documentar como criar o primeiro usuário, iniciar os dois projetos, configurar serviços externos, publicar, repetir um trabalho com falha e restaurar backup.
- Manter separadas as funcionalidades verificadas localmente e as integrações verificadas em produção; documentar qualquer pendência concreta.

## Decisões necessárias antes de implementar

1. Confirmar o mecanismo e a versão do banco; o `.env` disponível não determina o driver.
2. Definir hospedagem/domínio do admin, runtime Node, proxy e gatilho autenticado de deploy da LP.
3. Selecionar storage de imagens, limites de upload e provedor de e-mail transacional.
4. Definir usuários iniciais, campos comerciais do formulário e política de privacidade/retenção.

Essas definições podem ser fechadas durante a fundação; não impedem a preparação da interface e dos contratos com dados de desenvolvimento.

## Referências técnicas

- [Next.js App Router](https://nextjs.org/docs/app): arquitetura proposta para o admin, com componentes de servidor, Server Functions e Route Handlers.
- [Prisma com MySQL/MariaDB](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/mysql): referência condicional, caso o mecanismo do banco existente seja confirmado.
- [Astro: renderização sob demanda](https://docs.astro.build/en/guides/on-demand-rendering/): requisitos para uma eventual migração do site estático para runtime com adapter.
