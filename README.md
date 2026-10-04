# bot-zouve

Bot de música para Discord. O projeto usa desenvolvimento orientado a especificações (SDD): requisitos e decisões devem ser registrados antes da implementação.

## Documentação do projeto

- [AGENTS.md](./AGENTS.md): instruções canônicas para agentes de desenvolvimento.
- [CLAUDE.md](./CLAUDE.md): ponto de entrada do Claude Code; complementa `AGENTS.md`.
- [SDD](./docs/SDD.md): fluxo, estrutura e critérios para especificações.
- [Especificação inicial](./docs/specs/0001-discord-music-bot/spec.md): escopo proposto e decisões ainda pendentes.

## Estado

TypeScript e `discord.js` foram escolhidos. O projeto tem uma base inicial executável; provedor de áudio e implantação ainda precisam ser decididos.

## Desenvolvimento

- Requer Node.js 22.12 ou superior.
- Copie `.env.example` para `.env` e preencha `DISCORD_TOKEN` com o token do bot criado no [Discord Developer Portal](https://discord.com/developers/applications).
- `npm install`: instala dependências.
- `npm run dev`: inicia em modo de desenvolvimento.
- `npm run build`: compila o TypeScript para `dist/`.
- `npm start`: inicia a versão compilada usando as variáveis de `.env`.

Nunca compartilhe ou versione o arquivo `.env`.

## Próximo passo

Revisar e aprovar a especificação inicial e decidir os itens em aberto antes de criar o plano técnico e iniciar a implementação.
