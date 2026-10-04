# Bot de música para Discord

- **Status:** Rascunho
- **Responsável pela aprovação:** Pendente

## Contexto e objetivo

Criar um bot para servidores Discord que permita aos membros controlar música em um canal de voz por meio de comandos slash. Esta especificação define o conjunto inicial proposto; não autoriza ainda a escolha de tecnologia ou de fonte de áudio.

## Usuários e pré-condições

- O usuário está em um servidor onde o bot está instalado.
- Para iniciar ou controlar uma reprodução, o usuário está conectado a um canal de voz acessível ao bot.
- O bot possui as permissões necessárias para entrar no canal e responder aos comandos.

## Requisitos funcionais

- **RF-001 — Tocar:** `/play <consulta>` adiciona uma faixa à fila e inicia a reprodução quando não houver outra faixa tocando.
- **RF-002 — Pausar e retomar:** `/pause` pausa a reprodução atual e `/resume` retoma uma reprodução pausada.
- **RF-003 — Pular:** `/skip` encerra a faixa atual e tenta iniciar a próxima faixa da fila.
- **RF-004 — Encerrar:** `/stop` encerra a reprodução, limpa a fila e desconecta o bot do canal de voz.
- **RF-005 — Consultar fila:** `/queue` apresenta as faixas aguardando reprodução em ordem.
- **RF-006 — Faixa atual:** `/nowplaying` informa a faixa em reprodução ou informa que não há faixa ativa.
- **RF-007 — Volume:** `/volume <valor>` ajusta o volume dentro do intervalo permitido, a ser definido no plano técnico.
- **RF-008 — Repetição:** `/loop <modo>` permite desligar repetição ou repetir a faixa atual ou a fila; os modos exatos e sua semântica precisam ser confirmados.
- **RF-009 — Permissões e estado:** comandos que dependem de reprodução ou canal de voz validam o estado atual e respondem com uma mensagem útil quando a ação não puder ser executada.
- **RF-010 — Escopo da sessão:** a fila e os controles de reprodução pertencem ao servidor Discord que iniciou a sessão; uma ação em um servidor não afeta outro.

## Requisitos não funcionais

- **RNF-001:** respostas de comandos devem ser claras e adequadas à interface do Discord.
- **RNF-002:** erros do provedor de áudio e do Discord devem ser reportados sem indicar sucesso falso.
- **RNF-003:** tokens e segredos não podem ser registrados em código, mensagens ao usuário ou logs.
- **RNF-004:** a fonte de áudio deve ser definida e avaliada quanto a disponibilidade, compatibilidade e termos de uso antes da implementação da reprodução.

## Critérios de aceite

- **CA-001:** `/play` em um servidor sem reprodução ativa inicia a primeira faixa aceita pelo provedor aprovado.
- **CA-002:** `/play` durante uma reprodução adiciona a nova faixa à fila sem interromper a atual.
- **CA-003:** pausar e retomar afetam a reprodução ativa, e uma solicitação inválida recebe uma resposta explicativa.
- **CA-004:** pular inicia a próxima faixa quando houver uma; encerrar limpa a fila e desconecta o bot.
- **CA-005:** fila e controles de servidores diferentes permanecem isolados.
- **CA-006:** chamadas de comandos por usuários sem as pré-condições necessárias não provocam falhas silenciosas nem ações em canais indevidos.
- **CA-007:** os modos de repetição e limites de volume seguem as decisões aprovadas antes da implementação.

## Fora de escopo

- Reprodução de áudio ou configuração de infraestrutura antes da escolha do provedor e da tecnologia.
- Comandos administrativos, playlists persistentes, busca avançada, recomendações, painel web e monetização.
- Reprodução simultânea em múltiplos canais do mesmo servidor.

## Decisões confirmadas

- **Linguagem:** TypeScript.
- **Biblioteca Discord:** `discord.js`, biblioteca comunitária para a API do Discord; não existe um SDK oficial geral da Discord para bots TypeScript.
- **Runtime mínimo inicial:** Node.js 22.12, compatível com a configuração inicial e a versão atual da biblioteca escolhida.

## Decisões pendentes

- Provedor(es) e formatos de entrada de áudio, incluindo avaliação de termos de uso e restrições aplicáveis.
- Política de acesso aos comandos: qualquer membro ou apenas funções/permissões específicas.
- Semântica e limites de `/loop` e `/volume`; tamanho máximo da fila e comportamento quando ela termina.
- Hospedagem, persistência necessária e estratégia para reconexão/recuperação após falhas.
- Nome final, idioma das respostas e tratamento de interações simultâneas no servidor.
