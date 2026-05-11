'use client';

import { useEffect } from 'react';

declare global {
  interface Navigator {
    modelContext?: {
      registerTool: (tool: {
        name: string;
        description: string;
        inputSchema: object;
        execute: (input: unknown, options: { signal: AbortSignal }) => Promise<unknown>;
      }) => void;
    };
  }
}

export function WebMCP() {
  useEffect(() => {
    if (!navigator.modelContext) return;

    const controller = new AbortController();

    navigator.modelContext.registerTool({
      name: 'search_testmesh_docs',
      description: 'Search TestMesh documentation for information about flows, actions, CLI commands, YAML schema, and deployment.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query',
          },
        },
        required: ['query'],
      },
      execute: async (input, { signal }) => {
        const { query } = input as { query: string };
        const res = await fetch(`/api/search?query=${encodeURIComponent(query)}`, { signal });
        return res.json();
      },
    });

    navigator.modelContext.registerTool({
      name: 'get_testmesh_docs',
      description: 'Retrieve full TestMesh documentation as markdown. Use this to understand how TestMesh works, its YAML flow format, action types, and setup instructions.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async (_input, { signal }) => {
        const res = await fetch('/llms-full.txt', { signal });
        return { content: await res.text(), format: 'markdown' };
      },
    });

    return () => controller.abort();
  }, []);

  return null;
}
