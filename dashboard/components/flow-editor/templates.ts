// Flow Templates Library
import type { FlowDefinition } from '@/lib/api/types';

export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  icon: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  definition: FlowDefinition;
}

export type TemplateCategory =
  | 'api-testing'
  | 'database'
  | 'e2e'
  | 'integration'
  | 'performance'
  | 'contract'
  | 'mock-server';

export const templateCategories: Record<TemplateCategory, { label: string; icon: string }> = {
  'api-testing': { label: 'API Testing', icon: 'Globe' },
  database: { label: 'Database', icon: 'Database' },
  e2e: { label: 'End-to-End', icon: 'GitMerge' },
  integration: { label: 'Integration', icon: 'Network' },
  performance: { label: 'Performance', icon: 'Zap' },
  contract: { label: 'Contract Testing', icon: 'FileCheck' },
  'mock-server': { label: 'Mock Server', icon: 'Server' },
};

export const flowTemplates: FlowTemplate[] = [
  // API Testing Templates
  {
    id: 'rest-api-crud',
    name: 'REST API CRUD Operations',
    description: 'Complete CRUD flow for a REST API with authentication and validation',
    category: 'api-testing',
    tags: ['rest', 'crud', 'auth'],
    icon: 'Globe',
    difficulty: 'beginner',
    definition: {
      name: 'REST API CRUD Test',
      description: 'Test Create, Read, Update, Delete operations on a REST API',
      suite: 'api-tests',
      tags: ['rest', 'crud'],
      env: {
        API_URL: 'https://api.example.com',
        API_KEY: 'your-api-key',
      },
      steps: [
        {
          id: 'create_user',
          action: 'http_request',
          name: 'Create User',
          config: {
            method: 'POST',
            url: '${API_URL}/users',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ${API_KEY}',
            },
            body: {
              name: 'Test User',
              email: 'test@example.com',
            },
          },
          assert: ['status == 201', '$.data.id != null'],
          output: {
            user_id: '$.data.id',
          },
        },
        {
          id: 'get_user',
          action: 'http_request',
          name: 'Get User',
          config: {
            method: 'GET',
            url: '${API_URL}/users/${user_id}',
            headers: {
              Authorization: 'Bearer ${API_KEY}',
            },
          },
          assert: ['status == 200', '$.data.email == "test@example.com"'],
        },
        {
          id: 'update_user',
          action: 'http_request',
          name: 'Update User',
          config: {
            method: 'PUT',
            url: '${API_URL}/users/${user_id}',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ${API_KEY}',
            },
            body: {
              name: 'Updated User',
            },
          },
          assert: ['status == 200', '$.data.name == "Updated User"'],
        },
        {
          id: 'delete_user',
          action: 'http_request',
          name: 'Delete User',
          config: {
            method: 'DELETE',
            url: '${API_URL}/users/${user_id}',
            headers: {
              Authorization: 'Bearer ${API_KEY}',
            },
          },
          assert: ['status == 204'],
        },
      ],
    },
  },

  {
    id: 'api-pagination',
    name: 'API Pagination Test',
    description: 'Test paginated API endpoints and aggregate results',
    category: 'api-testing',
    tags: ['pagination', 'loop'],
    icon: 'Repeat',
    difficulty: 'intermediate',
    definition: {
      name: 'API Pagination Test',
      description: 'Fetch all pages from a paginated API endpoint',
      suite: 'api-tests',
      tags: ['pagination'],
      env: {
        API_URL: 'https://api.example.com',
      },
      steps: [
        {
          id: 'fetch_first_page',
          action: 'http_request',
          name: 'Fetch First Page',
          config: {
            method: 'GET',
            url: '${API_URL}/items?page=1&limit=10',
          },
          output: {
            total_pages: '$.pagination.total_pages',
            items: '$.data',
          },
        },
        {
          id: 'fetch_remaining_pages',
          action: 'for_each',
          name: 'Fetch Remaining Pages',
          config: {
            items: '${range(2, total_pages + 1)}',
            item_var: 'page',
            steps: [
              {
                id: 'fetch_page',
                action: 'http_request',
                config: {
                  method: 'GET',
                  url: '${API_URL}/items?page=${page}&limit=10',
                },
                output: {
                  page_items: '$.data',
                },
              },
            ],
          },
        },
        {
          id: 'validate_results',
          action: 'assert',
          name: 'Validate Total Items',
          config: {
            expression: 'items.length > 0',
            message: 'Should have fetched items',
          },
        },
      ],
    },
  },

  // Database Templates
  {
    id: 'database-migration-test',
    name: 'Database Migration Test',
    description: 'Test database schema migrations and rollbacks',
    category: 'database',
    tags: ['migration', 'schema'],
    icon: 'Database',
    difficulty: 'intermediate',
    definition: {
      name: 'Database Migration Test',
      description: 'Verify database migrations work correctly',
      suite: 'database-tests',
      tags: ['migration'],
      env: {
        DB_HOST: 'localhost:5432',
        DB_NAME: 'testdb',
      },
      setup: [
        {
          id: 'backup_schema',
          action: 'database_query',
          name: 'Backup Current Schema',
          config: {
            connection: 'postgres://${DB_HOST}/${DB_NAME}',
            query: 'SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\'',
          },
          output: {
            original_tables: '$.rows',
          },
        },
      ],
      steps: [
        {
          id: 'create_table',
          action: 'database_query',
          name: 'Create New Table',
          config: {
            connection: 'postgres://${DB_HOST}/${DB_NAME}',
            query: 'CREATE TABLE IF NOT EXISTS test_users (id SERIAL PRIMARY KEY, name VARCHAR(100))',
          },
        },
        {
          id: 'verify_table',
          action: 'database_query',
          name: 'Verify Table Created',
          config: {
            connection: 'postgres://${DB_HOST}/${DB_NAME}',
            query: 'SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = \'test_users\')',
          },
          assert: ['$.rows[0].exists == true'],
        },
        {
          id: 'insert_data',
          action: 'database_query',
          name: 'Insert Test Data',
          config: {
            connection: 'postgres://${DB_HOST}/${DB_NAME}',
            query: 'INSERT INTO test_users (name) VALUES ($1) RETURNING id',
            params: ['Test User'],
          },
          output: {
            user_id: '$.rows[0].id',
          },
        },
      ],
      teardown: [
        {
          id: 'drop_table',
          action: 'database_query',
          name: 'Cleanup Test Table',
          config: {
            connection: 'postgres://${DB_HOST}/${DB_NAME}',
            query: 'DROP TABLE IF EXISTS test_users',
          },
        },
      ],
    },
  },

  // E2E Templates
  {
    id: 'e2e-user-journey',
    name: 'E2E User Journey',
    description: 'Complete user journey from signup to checkout',
    category: 'e2e',
    tags: ['browser', 'user-flow'],
    icon: 'Chrome',
    difficulty: 'advanced',
    definition: {
      name: 'E2E User Journey Test',
      description: 'Test complete user flow from registration to purchase',
      suite: 'e2e-tests',
      tags: ['e2e', 'browser'],
      env: {
        APP_URL: 'https://app.example.com',
      },
      steps: [
        {
          id: 'navigate_home',
          action: 'browser',
          name: 'Navigate to Home',
          config: {
            browser: 'chromium',
            headless: false,
            actions: [
              { type: 'navigate', url: '${APP_URL}' },
              { type: 'wait', duration: '2s' },
            ],
          },
        },
        {
          id: 'signup',
          action: 'browser',
          name: 'Sign Up',
          config: {
            actions: [
              { type: 'click', selector: 'button[data-test="signup"]' },
              { type: 'type', selector: 'input[name="email"]', text: 'test@example.com' },
              { type: 'type', selector: 'input[name="password"]', text: 'SecurePass123!' },
              { type: 'click', selector: 'button[type="submit"]' },
              { type: 'wait', duration: '3s' },
              { type: 'assert_visible', selector: '.dashboard' },
            ],
          },
        },
        {
          id: 'browse_products',
          action: 'browser',
          name: 'Browse Products',
          config: {
            actions: [
              { type: 'click', selector: 'a[href="/products"]' },
              { type: 'wait', duration: '2s' },
              { type: 'click', selector: '.product-card:first-child' },
            ],
          },
        },
        {
          id: 'add_to_cart',
          action: 'browser',
          name: 'Add to Cart',
          config: {
            actions: [
              { type: 'click', selector: 'button[data-test="add-to-cart"]' },
              { type: 'assert_text', selector: '.cart-count', text: '1' },
            ],
          },
        },
      ],
    },
  },

  // Mock Server Templates
  {
    id: 'mock-api-testing',
    name: 'Mock API Testing',
    description: 'Test against a mock API server with stateful responses',
    category: 'mock-server',
    tags: ['mock', 'api'],
    icon: 'Server',
    difficulty: 'intermediate',
    definition: {
      name: 'Mock API Test',
      description: 'Test API client against a mock server',
      suite: 'integration-tests',
      tags: ['mock', 'api'],
      setup: [
        {
          id: 'start_mock',
          action: 'mock_server_start',
          name: 'Start Mock Server',
          config: {
            name: 'api_mock',
            port: 8080,
            endpoints: [
              {
                path: '/users',
                method: 'GET',
                response: {
                  status: 200,
                  body: {
                    users: [
                      { id: 1, name: 'Alice' },
                      { id: 2, name: 'Bob' },
                    ],
                  },
                },
              },
              {
                path: '/users/:id',
                method: 'GET',
                response: {
                  status: 200,
                  body: { id: '${params.id}', name: 'User ${params.id}' },
                },
              },
            ],
          },
        },
      ],
      steps: [
        {
          id: 'get_users',
          action: 'http_request',
          name: 'Get All Users',
          config: {
            method: 'GET',
            url: 'http://localhost:8080/users',
          },
          assert: ['status == 200', '$.users.length == 2'],
        },
        {
          id: 'get_user',
          action: 'http_request',
          name: 'Get User by ID',
          config: {
            method: 'GET',
            url: 'http://localhost:8080/users/1',
          },
          assert: ['status == 200', '$.id == 1'],
        },
      ],
      teardown: [
        {
          id: 'stop_mock',
          action: 'mock_server_stop',
          name: 'Stop Mock Server',
          config: {
            name: 'api_mock',
          },
        },
      ],
    },
  },

  // Contract Testing Template
  {
    id: 'contract-testing-basic',
    name: 'Consumer-Provider Contract',
    description: 'Basic contract testing between consumer and provider',
    category: 'contract',
    tags: ['pact', 'contract'],
    icon: 'FileCheck',
    difficulty: 'advanced',
    definition: {
      name: 'Contract Test',
      description: 'Verify consumer-provider contract compatibility',
      suite: 'contract-tests',
      tags: ['contract', 'pact'],
      steps: [
        {
          id: 'generate_contract',
          action: 'contract_generate',
          name: 'Generate Contract',
          config: {
            consumer: 'web-app',
            provider: 'user-service',
            interactions: [
              {
                description: 'Get user by ID',
                request: {
                  method: 'GET',
                  path: '/users/1',
                },
                response: {
                  status: 200,
                  body: {
                    id: 1,
                    name: 'Alice',
                  },
                },
              },
            ],
          },
          output: {
            contract_id: '$.contract_id',
          },
        },
        {
          id: 'verify_contract',
          action: 'contract_verify',
          name: 'Verify Against Provider',
          config: {
            contract_id: '${contract_id}',
            provider_url: 'http://localhost:3000',
          },
          assert: ['verification_result.success == true'],
        },
      ],
    },
  },

  // Performance Testing Template
  {
    id: 'load-test-parallel',
    name: 'Parallel Load Test',
    description: 'Simulate concurrent users hitting an API endpoint',
    category: 'performance',
    tags: ['load', 'performance', 'parallel'],
    icon: 'Zap',
    difficulty: 'advanced',
    definition: {
      name: 'Load Test',
      description: 'Test API performance under concurrent load',
      suite: 'performance-tests',
      tags: ['load', 'performance'],
      env: {
        API_URL: 'https://api.example.com',
        CONCURRENT_USERS: '50',
      },
      steps: [
        {
          id: 'parallel_requests',
          action: 'parallel',
          name: 'Simulate Concurrent Users',
          config: {
            wait_for_all: true,
            fail_fast: false,
            max_concurrent: 50,
            steps: [
              {
                id: 'user_request',
                action: 'http_request',
                config: {
                  method: 'GET',
                  url: '${API_URL}/products',
                },
                output: {
                  response_time: '$.duration_ms',
                },
              },
            ],
          },
        },
        {
          id: 'analyze_results',
          action: 'transform',
          name: 'Calculate Performance Metrics',
          config: {
            operation: 'javascript',
            input: '${parallel_requests.results}',
            expression: `
              const times = input.map(r => r.response_time);
              return {
                avg: times.reduce((a,b) => a+b, 0) / times.length,
                min: Math.min(...times),
                max: Math.max(...times),
                p95: times.sort()[Math.floor(times.length * 0.95)]
              };
            `,
            output_var: 'metrics',
          },
        },
        {
          id: 'validate_performance',
          action: 'assert',
          name: 'Validate Performance SLA',
          config: {
            expression: 'metrics.p95 < 1000',
            message: 'P95 response time should be under 1 second',
          },
        },
      ],
    },
  },

  // Integration Testing Template
  {
    id: 'microservices-integration',
    name: 'Microservices Integration',
    description: 'Test integration between multiple microservices',
    category: 'integration',
    tags: ['microservices', 'integration'],
    icon: 'Network',
    difficulty: 'advanced',
    definition: {
      name: 'Microservices Integration Test',
      description: 'Verify communication between multiple services',
      suite: 'integration-tests',
      tags: ['microservices'],
      env: {
        USER_SERVICE: 'http://localhost:3001',
        ORDER_SERVICE: 'http://localhost:3002',
        PAYMENT_SERVICE: 'http://localhost:3003',
      },
      steps: [
        {
          id: 'create_user',
          action: 'http_request',
          name: 'Create User (User Service)',
          config: {
            method: 'POST',
            url: '${USER_SERVICE}/users',
            body: { name: 'Test User', email: 'test@example.com' },
          },
          output: {
            user_id: '$.data.id',
          },
        },
        {
          id: 'create_order',
          action: 'http_request',
          name: 'Create Order (Order Service)',
          config: {
            method: 'POST',
            url: '${ORDER_SERVICE}/orders',
            body: {
              user_id: '${user_id}',
              items: [{ product_id: 1, quantity: 2 }],
            },
          },
          output: {
            order_id: '$.data.id',
            total_amount: '$.data.total',
          },
        },
        {
          id: 'process_payment',
          action: 'http_request',
          name: 'Process Payment (Payment Service)',
          config: {
            method: 'POST',
            url: '${PAYMENT_SERVICE}/payments',
            body: {
              order_id: '${order_id}',
              amount: '${total_amount}',
              method: 'credit_card',
            },
          },
          assert: ['status == 200', '$.data.status == "completed"'],
        },
        {
          id: 'verify_order_updated',
          action: 'http_request',
          name: 'Verify Order Status Updated',
          config: {
            method: 'GET',
            url: '${ORDER_SERVICE}/orders/${order_id}',
          },
          assert: ['$.data.payment_status == "paid"'],
        },
      ],
    },
  },
];

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: TemplateCategory): FlowTemplate[] {
  return flowTemplates.filter((t) => t.category === category);
}

/**
 * Get template by ID
 */
export function getTemplateById(id: string): FlowTemplate | undefined {
  return flowTemplates.find((t) => t.id === id);
}

/**
 * Search templates
 */
export function searchTemplates(query: string): FlowTemplate[] {
  const lowerQuery = query.toLowerCase();
  return flowTemplates.filter(
    (t) =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}
