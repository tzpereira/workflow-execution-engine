---
name: agent-harness-design
description: Princípios de design de harness para agentes de código em tarefas longas e autônomas (multi-hora, multi-sessão, codebases geradas por agente). Use ao projetar, simplificar ou depurar harnesses de agentes (planner/generator/evaluator, loops de QA, context resets, AGENTS.md, docs-as-system-of-record, linters de arquitetura, garbage collection de código IA). Baseado exclusivamente em dois artigos: "Harness design for long-running application development" (Anthropic, mar/2026) e "Alavancando o Codex em um mundo centrado no agente" (OpenAI, fev/2026).
---

# Design de Harness para Agentes de Código

Fonte: 2 artigos. Anthropic (harness planner/generator/evaluator) e OpenAI (repositório 100% gerado por agente, 1M LOC, 0 código manual).

## Princípio central

- Humanos dirigem; agentes executam. O papel do engenheiro vira: projetar ambientes, especificar intenção, construir loops de feedback (OpenAI).
- Cada componente do harness codifica uma suposição sobre o que o modelo NÃO faz sozinho. Suposições envelhecem. A cada novo modelo, remova peças não mais load-bearing, uma por vez (Anthropic).
- Regra base: "solução mais simples possível; aumente complexidade só quando necessário."

## Arquitetura de 3 agentes (Anthropic)

Inspirada em GAN: separar quem faz de quem julga.

1. **Planner**: expande prompt de 1-4 frases em spec completa. Ambicioso em escopo, alto nível (produto + design técnico geral). NÃO detalhar implementação: erros na spec cascateiam. Sem planner, o generator sub-escopa.
2. **Generator**: implementa 1 feature por vez (sprints). Auto-avalia antes de entregar ao QA. Git para versionamento.
3. **Evaluator (QA)**: usa Playwright para clicar no app rodando como usuário real. Grada por critérios com threshold rígido; falha = feedback detalhado.

Comunicação entre agentes via arquivos.

### Sprint contract
Antes de cada sprint, generator e evaluator negociam o que é "done" e como será verificado. Ponte entre spec de alto nível e implementação testável.

### Por que separar generator/evaluator
- Modelos elogiam o próprio trabalho, mesmo medíocre (pior em tarefas subjetivas).
- Tunar um evaluator externo cético é tratável; tornar o generator autocrítico não é.
- Out of the box, Claude é QA fraco: identifica bugs e "decide que não importa". Loop de tuning: ler logs do evaluator → achar divergências com julgamento humano → ajustar prompt. Várias rodadas.

### Tornar qualidade subjetiva gradável
"É bonito?" não funciona. "Segue nossos princípios de design?" funciona. Critérios da Anthropic (frontend):
1. Design quality (coerência, identidade)
2. Originality (penalizar "AI slop": gradientes roxos sobre cards brancos, templates)
3. Craft (tipografia, spacing, contraste)
4. Functionality (usabilidade)

Pesar mais 1 e 2 (modelo já é bom em 3 e 4). Calibrar evaluator com few-shot + score breakdowns. Cuidado: a linguagem dos critérios molda o output ("museum quality" causou convergência visual).

Loop: 5-15 iterações; generator decide após cada avaliação: refinar direção ou pivotar estética.

## Gestão de contexto

- **Context anxiety**: modelo encerra trabalho cedo ao achar que o contexto vai acabar. Compaction não resolve (não dá "clean slate").
- **Context reset**: limpar contexto + handoff estruturado com estado e próximos passos. Resolve anxiety, custa orquestração/tokens/latência.
- Modelos melhores dispensam resets (Opus 4.6 rodou 2h+ coerente numa sessão só, com compaction automática). Reavalie a necessidade a cada modelo.

## Repositório como sistema de registro (OpenAI)

- **AGENTS.md gigante falha**: consome contexto, "tudo importante = nada importante", apodrece, inverificável.
- Solução: AGENTS.md ~100 linhas como **índice/mapa**, apontando para `docs/` estruturado (design-docs, exec-plans ativos/completos, product-specs, references llms.txt, ARCHITECTURE.md, tech-debt-tracker).
- **Progressive disclosure**: ponto de entrada pequeno e estável; agente sabe onde buscar mais.
- O que o agente não acessa no contexto **não existe**. Discussão no Slack, doc no Google Drive = ilegível. Tudo vai para artefatos versionados no repo.
- Aplicar mecanicamente: linters e CI validam frescor/interligação da doc; agente recorrente de "manutenção de docs" abre PRs de correção.
- Planos são artefatos de primeira classe, versionados no repo.

## Legibilidade do agente > preferência humana

- Otimize o repo para o agente ler, inspecionar, validar e modificar.
- Prefira tecnologias "chatas": estáveis, componíveis, bem representadas no treino.
- Às vezes é mais barato o agente reimplementar um subconjunto (ex.: helper de concorrência próprio, 100% coberto, integrado ao OpenTelemetry) do que depender de lib opaca.
- Torne app/logs/métricas legíveis ao agente: app bootável por git worktree (1 instância por mudança), Chrome DevTools Protocol (DOM, screenshots, navegação), observabilidade efêmera por worktree (LogQL/PromQL). Isso viabiliza instruções como "startup < 800ms".
- Código não precisa agradar estilo humano; precisa ser correto, mantível e legível para execuções futuras do agente.

## Impor invariantes, não microgerenciar

- Limites rígidos + estrutura previsível = agentes eficazes.
- Camadas fixas por domínio (Types → Config → Repo → Service → Runtime → UI); cross-cutting só via interface única (Providers). Aplicado por linters customizados (gerados pelo agente) e testes estruturais.
- "Invariantes de gosto": logging estruturado, convenções de nome, limite de tamanho de arquivo. Mensagens de erro dos lints escritas como instruções de correção — entram no contexto do agente.
- Especifique o QUÊ (validar dados na borda), não o COMO (não impor Zod).
- Regras que pareceriam pedantes com humanos viram multiplicadores com agentes: codificadas uma vez, aplicadas em todo lugar.
- Arquitetura rígida vira pré-requisito inicial (não algo adiado até ter centenas de engenheiros).

## Throughput muda a filosofia de merge (OpenAI)

- Merge com mínimo de bloqueio; PRs curtas; testes flaky = follow-up, não bloqueio.
- Quando throughput do agente >> atenção humana: correção é barata, espera é cara.
- Revisão migra para agente-revisa-agente; humano revisa opcionalmente.
- Loop de PR (estilo "Ralph Wiggum"): agente revisa as próprias mudanças, pede revisões de outros agentes, responde feedback, itera até todos os revisores aprovarem.

## Entropia e garbage collection (OpenAI)

- Agente replica padrões existentes, inclusive ruins → drift inevitável.
- Limpeza manual (sextas de "resíduo de IA", 20% da semana) não escala.
- Solução: "princípios de ouro" mecânicos no repo (ex.: utilitários compartilhados > helpers ad hoc; validar bordas, nunca "YOLO parsing") + tarefas recorrentes de agente que detectam drift, atualizam scores de qualidade e abrem PRs de refactor (revisáveis em <1 min, auto-merge).
- Dívida técnica = empréstimo a juros altos: pague continuamente em parcelas pequenas.
- Gosto humano é capturado uma vez (comentário de review, bug) e codificado em doc ou ferramenta. Se doc não basta, vira código/lint.

## Quando o evaluator vale o custo (Anthropic)

- Não é sim/não fixo. Vale quando a tarefa está ALÉM do que o modelo faz confiável sozinho.
- Fronteira move com cada modelo: em Opus 4.5, evaluator ajudava em todo o build; em 4.6, só na borda da capacidade. Mesmo em 4.6, QA pegou gaps reais (features stub, interações display-only).
- Custo de referência: harness completo ~20x mais caro que solo ($200/6h vs $9/20min), mas solo produziu app com feature central quebrada.

## Checklist prático

1. Comece simples; adicione componente só contra falha observada.
2. Separe generator de evaluator; tune o evaluator para ceticismo com few-shot.
3. Converta qualidade subjetiva em critérios gradáveis; pese os fracos do modelo.
4. Sprint contracts: acordar "done" antes de codar.
5. Dê ao evaluator acesso real ao app (browser, logs, métricas), não screenshots estáticos.
6. AGENTS.md = índice curto; conhecimento em docs/ versionado e lintado.
7. Imponha invariantes por linters com mensagens-instrução; liberdade dentro dos limites.
8. GC contínuo: agentes recorrentes anti-drift.
9. A cada novo modelo: releia traces, remova scaffolding obsoleto peça por peça, teste novas capacidades.
10. Quando o agente trava, pergunte "que capacidade/ferramenta/doc falta?" — nunca "tente com mais força". Faça o próprio agente escrever a correção.
