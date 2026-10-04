# Desenvolvimento orientado a especificações (SDD)

Este projeto registra o comportamento esperado antes de planejar e implementar funcionalidades. A especificação é a referência para produto; o plano descreve a solução técnica; as tarefas dividem o trabalho verificável.

## Fluxo

1. **Entender:** identifique o pedido, o escopo, os usuários afetados e as decisões ainda não tomadas.
2. **Especificar:** crie ou atualize `docs/specs/<id>-<slug>/spec.md`. Descreva comportamento observável, requisitos e critérios de aceite sem impor detalhes técnicos prematuros.
3. **Revisar:** deixe explícitas as dúvidas e alternativas relevantes. Não assuma decisões que alterem escopo, custo, privacidade ou experiência do usuário.
4. **Aprovar:** marque a especificação como `Aprovada` somente após as decisões necessárias serem confirmadas.
5. **Planejar:** para uma especificação aprovada, registre arquitetura, interfaces, dados, riscos e validação em `plan.md`.
6. **Dividir:** crie `tasks.md` com tarefas pequenas, rastreáveis aos requisitos e com critérios de conclusão.
7. **Implementar e validar:** execute as tarefas, adicione testes e rode as verificações adequadas ao projeto.
8. **Concluir:** atualize a documentação afetada e marque a especificação como `Concluída` quando todos os critérios de aceite estiverem atendidos.

Não crie planos ou tarefas como se uma especificação em rascunho já estivesse aprovada. Se a implementação revelar uma mudança de comportamento necessária, atualize a especificação e obtenha aprovação antes de ampliar o escopo.

## Estrutura

```text
docs/
  SDD.md
  specs/
    0001-discord-music-bot/
      spec.md
      plan.md      # após aprovação
      tasks.md     # após aprovação do plano
```

Use identificadores numéricos sequenciais (`0002`, `0003`...) e slugs curtos em kebab-case para novas funcionalidades. Mudanças pequenas que já estejam cobertas por uma especificação podem atualizar essa especificação; funcionalidades independentes recebem uma nova pasta.

## Conteúdo de uma especificação

Use este roteiro em `spec.md`:

```markdown
# <Nome da funcionalidade>

- **Status:** Rascunho | Aprovada | Em implementação | Concluída
- **Responsável pela aprovação:** <pessoa ou equipe>

## Contexto e objetivo
## Usuários e pré-condições
## Requisitos funcionais
## Requisitos não funcionais
## Critérios de aceite
## Fora de escopo
## Decisões pendentes
```

Requisitos devem ser numerados (`RF-001`, `RNF-001`) para permitir rastreabilidade. Critérios de aceite devem ser verificáveis, preferencialmente descritos como cenário, ação e resultado esperado. Registre decisões aprovadas e altere o status correspondente; não apague o histórico de decisões relevantes.
