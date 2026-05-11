export const revalidate = false;

export async function GET() {
  const catalog = {
    linkset: [
      {
        anchor: 'https://app.testmesh.io/api/v1',
        'service-desc': [
          {
            href: 'https://app.testmesh.io/api/v1/openapi.json',
            type: 'application/schema+json',
          },
        ],
        'service-doc': [
          {
            href: 'https://www.testmesh.io/docs',
            type: 'text/html',
          },
        ],
        status: [
          {
            href: 'https://app.testmesh.io/health',
            type: 'application/json',
          },
        ],
      },
      {
        anchor: 'https://app.testmesh.io/mcp',
        'service-desc': [
          {
            href: 'https://www.testmesh.io/.well-known/mcp/server-card.json',
            type: 'application/json',
          },
        ],
        'service-doc': [
          {
            href: 'https://www.testmesh.io/docs/features/mcp',
            type: 'text/html',
          },
        ],
      },
    ],
  };

  return new Response(JSON.stringify(catalog, null, 2), {
    headers: {
      'Content-Type': 'application/linkset+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
