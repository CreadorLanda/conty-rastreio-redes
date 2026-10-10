# Métricas das redes do criador

Serviço que sincroniza métricas de posts (views, curtidas, comentários) de uma conexão já autorizada. O token é fictício: o foco é a regra de negócio que sobrevive a timeout, resposta duplicada e limite de taxa, sem contar o mesmo post duas vezes.

## Desenho

- `MetricsProvider` (`src/provider.ts`) é a fronteira com o mundo externo. `FakeMetricsProvider` (`src/fake-provider.ts`) implementa essa interface e é roteirizável (passo a passo: `ok`, `timeout`, `rate_limit`), então o provedor falso nunca vaza para dentro da regra.
- `MetricsSyncService` (`src/sync.ts`) orquestra a resiliência e grava via `MetricsStore` (`src/store.ts`). Relógio e `sleep` são injetados, o que deixa os testes de tempo determinísticos.

## Idempotência

Cada snapshot tem identidade `connectionId + postId + capturedAt`. O store ignora uma identidade que já existe, então duas sincronizações com janelas que se sobrepõem — ou o mesmo post repetido numa resposta — não somam o número de novo. Uma medição nova do mesmo post (outro `capturedAt`) é um snapshot novo e é guardada. Cada snapshot guarda o `fetchedAt`, então dá para saber quando a métrica foi buscada.

## Timeout e limite de taxa

- Timeout e falhas transitórias têm retry com backoff exponencial, limitado por `maxAttempts` (sem loop infinito) e por `maxBackoffMs`.
- Em `429`, a espera é o `Retry-After` do provedor, limitada ao teto configurado (`min(retryAfter, maxBackoffMs)`).

Testes em `test/sync.test.ts` cobrem janela sobreposta, dedupe na mesma resposta, Retry-After abaixo e acima do teto, esgotamento de tentativas e recuperação após um timeout isolado, com relógio e `sleep` controlados.

## Como rodar

Node 22.

```bash
npm install
npm test
npm run dev   # http://127.0.0.1:3004
```

```bash
curl -s -X POST localhost:3004/connections/con_demo/sync
curl -s localhost:3004/connections/con_demo/metrics
```

## Uso de IA

Usei o Claude para criar os testes.
