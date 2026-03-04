import { test, expect, request } from '@playwright/test';

test.describe('API Endpoints', () => {
  let apiContext: any;

  test.beforeAll(async () => {
    apiContext = await request.newContext({
      baseURL: process.env.API_URL || 'http://localhost:5016',
      extraHTTPHeaders: {
        'Content-Type': 'application/json',
      },
    });
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test('GET /health should return healthy status', async () => {
    const response = await apiContext.get('/health');
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.status).toBe('healthy');
  });

  test('GET /api/v1/flows should return flow list', async () => {
    const response = await apiContext.get('/api/v1/flows');
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(Array.isArray(body.flows)).toBeTruthy();
  });

  test('POST /api/v1/flows should create new flow', async () => {
    const response = await apiContext.post('/api/v1/flows', {
      data: {
        name: 'API Test Flow',
        description: 'Created via E2E API test',
        yaml: `
name: API Test Flow
steps:
  - id: step1
    name: Test Step
    action:
      type: http
      http:
        method: GET
        url: https://httpbin.org/get
`,
      },
    });

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.id).toBeTruthy();
    expect(body.name).toBe('API Test Flow');
  });

  test('POST /api/v1/flows/:id/execute should run flow', async () => {
    // First create a flow
    const createResponse = await apiContext.post('/api/v1/flows', {
      data: {
        name: 'Execution Test',
        yaml: `
name: Execution Test
steps:
  - id: step1
    name: HTTP Get
    action:
      type: http
      http:
        method: GET
        url: https://httpbin.org/get
`,
      },
    });

    const flow = await createResponse.json();

    // Execute the flow
    const executeResponse = await apiContext.post(`/api/v1/flows/${flow.id}/execute`);
    expect(executeResponse.ok()).toBeTruthy();

    const execution = await executeResponse.json();
    expect(execution.execution_id).toBeTruthy();
    expect(['running', 'passed', 'failed']).toContain(execution.status);
  });

  test('GET /api/v1/executions/:id should return execution details', async () => {
    // Create and execute flow
    const createResponse = await apiContext.post('/api/v1/flows', {
      data: {
        name: 'Detail Test',
        yaml: `
name: Detail Test
steps:
  - id: step1
    name: Simple Step
    action:
      type: delay
      delay: 100ms
`,
      },
    });

    const flow = await createResponse.json();
    const executeResponse = await apiContext.post(`/api/v1/flows/${flow.id}/execute`);
    const execution = await executeResponse.json();

    // Wait for completion
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get details
    const detailResponse = await apiContext.get(`/api/v1/executions/${execution.execution_id}`);
    expect(detailResponse.ok()).toBeTruthy();

    const details = await detailResponse.json();
    expect(details.id).toBe(execution.execution_id);
    expect(details.steps).toBeTruthy();
  });

  test('DELETE /api/v1/flows/:id should delete flow', async () => {
    // Create flow
    const createResponse = await apiContext.post('/api/v1/flows', {
      data: {
        name: 'Delete Test',
        yaml: 'name: Delete Test\nsteps: []',
      },
    });

    const flow = await createResponse.json();

    // Delete flow
    const deleteResponse = await apiContext.delete(`/api/v1/flows/${flow.id}`);
    expect(deleteResponse.ok()).toBeTruthy();

    // Verify deleted
    const getResponse = await apiContext.get(`/api/v1/flows/${flow.id}`);
    expect(getResponse.status()).toBe(404);
  });
});

test.describe('AI Endpoints', () => {
  let apiContext: any;

  test.beforeAll(async () => {
    apiContext = await request.newContext({
      baseURL: process.env.API_URL || 'http://localhost:5016',
    });
  });

  test('POST /api/v1/ai/generate should generate flow from description', async () => {
    const response = await apiContext.post('/api/v1/ai/generate', {
      data: {
        description: 'Test API endpoint GET /users that returns 200',
      },
    });

    // May fail if AI not configured - that's OK
    if (response.ok()) {
      const body = await response.json();
      expect(body.flow_yaml).toBeTruthy();
    } else {
      expect(response.status()).toBe(503); // Service unavailable
    }
  });

  test('POST /api/v1/ai/analyze should analyze flow', async () => {
    const response = await apiContext.post('/api/v1/ai/analyze', {
      data: {
        flow_yaml: `
name: Analysis Test
steps:
  - id: step1
    name: Get Users
    action:
      type: http
      http:
        method: GET
        url: /users
`,
      },
    });

    if (response.ok()) {
      const body = await response.json();
      expect(body.suggestions || body.issues).toBeTruthy();
    }
  });
});
