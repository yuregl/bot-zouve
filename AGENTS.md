# Instruções para agentes

## Fonte de verdade

- Leia este arquivo e a especificação relevante em `docs/specs/` antes de propor ou alterar comportamento.
- `AGENTS.md` é a fonte canônica das instruções compartilhadas. Arquivos específicos de ferramentas devem apontar para cá e não duplicar regras.
- Siga `docs/SDD.md`. Se uma solicitação alterar comportamento sem especificação aprovada, atualize a especificação e peça confirmação quando a mudança depender de uma decisão de produto.
- Não trate decisões marcadas como pendentes como requisitos aprovados.

## Regras do projeto

- A interface do bot é em português; mantenha nomes de comandos slash claros e consistentes.
- Não escolha linguagem, biblioteca, provedor de áudio, armazenamento ou hospedagem sem registrar a decisão em uma especificação aprovada.
- Nunca exponha tokens, segredos ou dados privados. Use variáveis de ambiente e mantenha exemplos sem valores reais.
- Valide permissões do usuário, do bot e do canal de voz antes de iniciar ou controlar reprodução.
- Informe erros de forma clara; não ignore falhas nem apresente sucesso quando uma operação falhar.
- Preserve o escopo aprovado. Para mudanças de comportamento, atualize requisitos e critérios de aceite antes ou junto da implementação.
- Prefira mudanças pequenas e tipadas, seguindo os padrões existentes. Não adicione dependências sem necessidade justificada.

## Implementação e validação

- Para cada requisito implementado, adicione ou atualize testes relevantes.
- Execute os testes, verificações estáticas e build aplicáveis ao projeto; relate comandos e resultados.
- Mantenha a documentação de configuração e operação alinhada ao comportamento real.
- Não implemente funcionalidades dependentes de um provedor de áudio até que o provedor e seus termos de uso tenham sido avaliados e aprovados.
