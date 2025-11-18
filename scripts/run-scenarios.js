#!/usr/bin/env tsx
import { assertConfig, config } from '../src/config.js';
import { OpenRouterClient } from '../src/openrouterClient.js';
import { CodingAdvisorCoordinator } from '../src/codingAdvisors.js';
const scenarios = [
    {
        name: 'React hydration + suspense deadlock',
        question: 'Next.js 15 app using React 19 RC occasionally hangs with a hydration error "Text content does not match server-rendered HTML" when Suspense + dynamic import are combined. How to stabilise hydration?',
        context: 'Key details: components use experimental `use()` with a data fetch; devtools shows server output includes `Loading…` placeholders that never resolve on client. There is also a custom `AppShell` that wraps everything in `<Suspense fallback={<Spinner/>}>`. Need actionable mitigation steps.',
    },
    {
        name: 'Node.js worker threads crash under load',
        question: 'A worker-thread pool processing image thumbnails dies after 2-3k jobs with ERR_WORKER_UNSERIALIZABLE_ERROR. How can we keep the pool alive?',
        context: 'Implementation: parent sends `{ filePath, width, height }` objects to workers via `worker.postMessage`. Crash logs show `Cannot clone object, FileHandle` when streams are passed. Need suggestions for redesign + instrumentation.',
    },
    {
        name: 'Go gRPC memory spike',
        question: 'Go 1.23 microservice uses gRPC streaming and memory climbs steadily until OOM. Profiling shows `runtime.malg` + `google.golang.org/grpc/internal/transport/recvBuffer` dominating. How to stop the leak?',
        context: 'Service streams protobuf chunks (~2MB) to clients with slow downstream. GOGC=100, but queue grows. We already set `grpc.MaxConcurrentStreams(10)` yet leak persists.',
    },
];
async function main() {
    const filter = process.env.SCENARIO?.toLowerCase();
    const selected = filter
        ? scenarios.filter((scenario) => scenario.name.toLowerCase().includes(filter))
        : scenarios;
    if (selected.length === 0) {
        console.error('No scenarios matched filter:', filter);
        process.exit(1);
    }
    assertConfig();
    const client = new OpenRouterClient(config.apiKey, {
        appName: config.appName,
        referer: config.referer,
    });
    const coordinator = new CodingAdvisorCoordinator(client);
    for (const scenario of selected) {
        console.log(`\n=== Scenario: ${scenario.name} ===`);
        try {
            const batch = await coordinator.advise({
                question: scenario.question,
                context: scenario.context,
            });
            batch.answers.forEach((answer, idx) => {
                console.log(`\nAdvisor ${idx + 1}: ${answer.modelLabel}`);
                console.log(`Tier: ${answer.isFree ? 'free' : 'paid'} | Latency: ${answer.latencyMs}ms | Tag: ${answer.scenarioTag}`);
                if (answer.usage) {
                    console.log(`Usage: prompt=${answer.usage.promptTokens ?? 'n/a'}, completion=${answer.usage.completionTokens ?? 'n/a'}`);
                }
                console.log('---');
                console.log(answer.responseText);
                console.log('---\n');
            });
        }
        catch (error) {
            console.error('Scenario failed:', scenario.name, error);
        }
    }
}
main().catch((error) => {
    console.error('Fatal scenario runner error', error);
    process.exit(1);
});
//# sourceMappingURL=run-scenarios.js.map