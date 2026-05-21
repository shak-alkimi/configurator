import version from '../../shared/version.json' with { type: 'json' };

Deno.serve(() => {
    return Response.json({
        sha: version.sha,
        ts: version.ts,
        runtime: 'deno',
    });
});
