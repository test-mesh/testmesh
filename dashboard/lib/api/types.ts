// API Types for TestMesh

export interface Flow {
  id: string;
  name: string;
  description: string;
  suite: string;
  tags: string[];
  definition: FlowDefinition;
  environment: string;
  collection_id?: string;
  sort_order?: number;
  created_at: string;
  updated_at: string;
}

export interface FlowDefinition {
  name: string;
  description: string;
  suite: string;
  tags: string[];
  env?: Record<string, any>;
  setup?: Step[];
  steps: Step[];
  teardown?: Step[];
}

export interface Step {
  id?: string;
  action: string;
  name?: string;
  description?: string;
  config: Record<string, any>;
  assert?: string[];
  output?: Record<string, string>;
  retry?: RetryConfig;
  timeout?: string;
}

export interface RetryConfig {
  max_attempts: number;
  delay: string;
  backoff?: string;
}

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Execution {
  id: string;
  flow_id: string;
  flow?: Flow;
  status: ExecutionStatus;
  environment: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number;
  total_steps: number;
  passed_steps: number;
  failed_steps: number;
  error?: string;
  created_at: string;
  updated_at: string;
}

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface ExecutionStep {
  id: string;
  execution_id: string;
  step_id: string;
  step_name: string;
  action: string;
  status: StepStatus;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number;
  output: Record<string, any>;
  error_message?: string;
  attempt: number;
  created_at: string;
  updated_at: string;
}

// Mock Server Types
export type MockServerStatus = 'starting' | 'running' | 'stopped' | 'failed';

export interface MockServer {
  id: string;
  execution_id?: string;
  name: string;
  port: number;
  base_url: string;
  status: MockServerStatus;
  started_at?: string;
  stopped_at?: string;
  created_at: string;
  updated_at: string;
}

export interface MockEndpoint {
  id: string;
  mock_server_id: string;
  path: string;
  method: string;
  match_config: MatchConfig;
  response_config: ResponseConfig;
  state_config?: StateConfig;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface MatchConfig {
  path_pattern?: string;
  headers?: Record<string, string>;
  query_params?: Record<string, string>;
  body_pattern?: string;
  body_json?: Record<string, any>;
}

export interface ResponseConfig {
  status_code: number;
  headers?: Record<string, string>;
  body?: any;
  body_json?: Record<string, any>;
  body_text?: string;
  delay_ms?: number;
  template?: boolean;
  template_vars?: Record<string, any>;
}

export interface StateConfig {
  state_key: string;
  initial_value?: any;
  update_rule?: string;
  update_value?: any;
  condition?: Record<string, any>;
}

export interface MockRequest {
  id: string;
  mock_server_id: string;
  endpoint_id?: string;
  method: string;
  path: string;
  headers: Record<string, any>;
  query_params: Record<string, any>;
  body: string;
  matched: boolean;
  response_code: number;
  received_at: string;
}

export interface MockState {
  id: string;
  mock_server_id: string;
  state_key: string;
  state_value: Record<string, any>;
  updated_at: string;
}

// Contract Testing Types
export type VerificationStatus = 'pending' | 'passed' | 'failed';
export type BreakingChangeSeverity = 'critical' | 'major' | 'minor';

export interface Contract {
  id: string;
  consumer: string;
  provider: string;
  version: string;
  pact_version: string;
  contract_data: ContractData;
  flow_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ContractData {
  consumer: { name: string };
  provider: { name: string };
  interactions: Interaction[];
  metadata: {
    pactSpecification: { version: string };
    client?: { name: string; version: string };
  };
}

export interface Interaction {
  id: string;
  contract_id: string;
  description: string;
  provider_state?: string;
  request: HTTPRequest;
  response: HTTPResponse;
  interaction_type: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface HTTPRequest {
  method: string;
  path: string;
  query?: Record<string, any>;
  headers?: Record<string, any>;
  body?: any;
}

export interface HTTPResponse {
  status: number;
  headers?: Record<string, any>;
  body?: any;
}

export interface Verification {
  id: string;
  contract_id: string;
  provider_version: string;
  status: VerificationStatus;
  verified_at: string;
  results: VerificationResults;
  execution_id?: string;
  created_at: string;
  updated_at: string;
}

export interface VerificationResults {
  total_interactions: number;
  passed_interactions: number;
  failed_interactions: number;
  details: InteractionResult[];
  summary: string;
}

export interface InteractionResult {
  interaction_id: string;
  description: string;
  passed: boolean;
  mismatches?: Mismatch[];
  actual_request?: Record<string, any>;
  actual_response?: Record<string, any>;
}

export interface Mismatch {
  type: string;
  expected: any;
  actual: any;
  path?: string;
  message: string;
}

export interface BreakingChange {
  id: string;
  old_contract_id: string;
  new_contract_id: string;
  change_type: string;
  severity: BreakingChangeSeverity;
  description: string;
  details: ChangeDetails;
  detected_at: string;
  created_at: string;
}

export interface ChangeDetails {
  interaction_id?: string;
  field?: string;
  old_value?: any;
  new_value?: any;
  impact: string;
  suggestion?: string;
  metadata?: Record<string, any>;
}

// API Request/Response Types

export interface CreateFlowRequest {
  yaml: string;
}

export interface UpdateFlowRequest {
  yaml: string;
}

export interface ListFlowsResponse {
  flows: Flow[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateExecutionRequest {
  flow_id: string;
  environment?: string;
  variables?: Record<string, string>;
}

export interface ListExecutionsResponse {
  executions: Execution[];
  total: number;
  limit: number;
  offset: number;
}

export interface GetStepsResponse {
  steps: ExecutionStep[];
}

export interface GetLogsResponse {
  logs: string[];
}

export interface HealthResponse {
  status: string;
  database: string;
  service: string;
  version: string;
}

// Mock Server API Responses
export interface ListMockServersResponse {
  servers: MockServer[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListMockEndpointsResponse {
  endpoints: MockEndpoint[];
  total: number;
}

export interface ListMockRequestsResponse {
  requests: MockRequest[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListMockStatesResponse {
  states: MockState[];
  total: number;
}

// Contract Testing API Responses
export interface ListContractsResponse {
  contracts: Contract[];
  total: number;
  limit: number;
  offset: number;
}

export interface GetContractResponse {
  contract: Contract;
  interactions: Interaction[];
}

export interface ListVerificationsResponse {
  verifications: Verification[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListBreakingChangesResponse {
  changes: BreakingChange[];
  total: number;
}

export interface DetectBreakingChangesResponse {
  changes: BreakingChange[];
  summary: {
    total: number;
    critical: number;
    major: number;
    minor: number;
  };
}

// Reporting & Analytics Types

export type ReportStatus = 'pending' | 'generating' | 'completed' | 'failed';
export type ReportFormat = 'html' | 'json' | 'junit';

export interface ReportFilters {
  suites?: string[];
  flow_ids?: string[];
  tags?: string[];
  environments?: string[];
  statuses?: string[];
}

export interface Report {
  id: string;
  name: string;
  format: ReportFormat;
  status: ReportStatus;
  filters: ReportFilters;
  start_date: string;
  end_date: string;
  file_path?: string;
  file_size: number;
  generated_at?: string;
  expires_at?: string;
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface DailyMetric {
  id: string;
  date: string;
  environment: string;
  total_flows: number;
  total_executions: number;
  passed_executions: number;
  failed_executions: number;
  pass_rate: number;
  avg_duration_ms: number;
  p50_duration_ms: number;
  p95_duration_ms: number;
  p99_duration_ms: number;
  total_steps: number;
  passed_steps: number;
  failed_steps: number;
  by_flow_metrics?: Record<string, FlowMetricEntry>;
  by_suite_metrics?: Record<string, SuiteMetricEntry>;
  created_at: string;
  updated_at: string;
}

export interface FlowMetricEntry {
  flow_id: string;
  flow_name: string;
  executions: number;
  passed: number;
  failed: number;
  pass_rate: number;
  avg_duration_ms: number;
}

export interface SuiteMetricEntry {
  suite: string;
  flows: number;
  executions: number;
  passed: number;
  failed: number;
  pass_rate: number;
  avg_duration_ms: number;
}

export interface FlakinessMetric {
  id: string;
  flow_id: string;
  flow?: Flow;
  window_start_date: string;
  window_end_date: string;
  window_days: number;
  total_executions: number;
  passed_executions: number;
  failed_executions: number;
  transitions: number;
  flakiness_score: number;
  is_flaky: boolean;
  failure_patterns?: string[];
  created_at: string;
  updated_at: string;
}

export interface StepPerformance {
  id: string;
  flow_id: string;
  flow?: Flow;
  step_id: string;
  step_name: string;
  action: string;
  date: string;
  execution_count: number;
  passed_count: number;
  failed_count: number;
  pass_rate: number;
  avg_duration_ms: number;
  min_duration_ms: number;
  max_duration_ms: number;
  p50_duration_ms: number;
  p95_duration_ms: number;
  p99_duration_ms: number;
  common_errors?: string[];
  created_at: string;
  updated_at: string;
}

export interface TrendPoint {
  date: string;
  executions: number;
  pass_rate: number;
  avg_duration_ms: number;
}

// Reporting API Requests/Responses

export interface GenerateReportRequest {
  name: string;
  format: ReportFormat;
  start_date: string;
  end_date: string;
  filters?: ReportFilters;
}

export interface ListReportsResponse {
  reports: Report[];
  total: number;
  limit: number;
  offset: number;
}

export interface GetMetricsResponse {
  metrics: DailyMetric[];
  start_date: string;
  end_date: string;
  summary: {
    total_executions: number;
    passed_executions: number;
    failed_executions: number;
    pass_rate: number;
    avg_duration_ms: number;
    total_steps: number;
    passed_steps: number;
    failed_steps: number;
  };
}

export interface GetFlakinessResponse {
  flaky_flows: FlakinessMetric[];
  total: number;
  limit: number;
  offset: number;
}

export interface GetFlakinessHistoryResponse {
  flow_id: string;
  history: FlakinessMetric[];
}

export interface GetTrendsResponse {
  trends: TrendPoint[];
  start_date: string;
  end_date: string;
  group_by: string;
}

export interface GetStepPerformanceResponse {
  step_performance?: StepPerformance[];
  slowest_steps?: StepPerformance[];
  flow_id?: string;
  action?: string;
  start_date: string;
  end_date: string;
}

// AI Types

export type AIProviderType = 'anthropic' | 'openai' | 'local';
export type GenerationStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type SuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'applied';
export type SuggestionType = 'fix' | 'optimization' | 'retry_strategy' | 'assertion' | 'timeout';

export interface GenerationHistory {
  id: string;
  provider: AIProviderType;
  model: string;
  prompt: string;
  status: GenerationStatus;
  generated_yaml?: string;
  flow_id?: string;
  flow?: Flow;
  tokens_used: number;
  latency_ms: number;
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface Suggestion {
  id: string;
  flow_id: string;
  flow?: Flow;
  execution_id?: string;
  execution?: Execution;
  type: SuggestionType;
  status: SuggestionStatus;
  title: string;
  description: string;
  original_yaml: string;
  suggested_yaml: string;
  diff_patch?: string;
  confidence: number;
  reasoning: string;
  applied_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ImportHistory {
  id: string;
  source_type: 'openapi' | 'postman' | 'pact';
  source_name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  flows_generated: number;
  flow_ids: string[];
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface CoverageAnalysis {
  id: string;
  spec_type: string;
  spec_name: string;
  status: 'pending' | 'analyzing' | 'completed' | 'failed';
  total_endpoints: number;
  covered_endpoints: number;
  coverage_percent: number;
  results: {
    covered: EndpointCoverage[];
    uncovered: EndpointCoverage[];
    partial: EndpointCoverage[];
  };
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface EndpointCoverage {
  method: string;
  path: string;
  operation_id?: string;
  description?: string;
  flow_ids?: string[];
  coverage: number;
  missing_tests?: string[];
}

// AI API Requests/Responses

export interface GenerateFlowRequest {
  prompt: string;
  provider?: AIProviderType;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  create_flow?: boolean;
}

export interface GenerateFlowResponse {
  history_id: string;
  yaml: string;
  flow: FlowDefinition;
  tokens_used: number;
  latency_ms: number;
  provider: AIProviderType;
  model: string;
}

export interface ImportOpenAPIRequest {
  spec: string;
  provider?: AIProviderType;
  model?: string;
  create_flows?: boolean;
}

export interface ImportResponse {
  import_id: string;
  flows_generated: number;
  flow_ids: string[];
  flows: Flow[];
}

export interface AnalyzeCoverageRequest {
  spec: string;
  base_url?: string;
}

export interface AnalyzeCoverageResponse {
  analysis_id: string;
  spec_name: string;
  total_endpoints: number;
  covered_endpoints: number;
  coverage_percent: number;
  covered: EndpointCoverage[];
  uncovered: EndpointCoverage[];
  partial: EndpointCoverage[];
}

export interface AnalyzeFailureResponse {
  execution_id: string;
  flow_id: string;
  suggestions: Suggestion[];
  analysis_notes: string;
}

export interface ListSuggestionsResponse {
  suggestions: Suggestion[];
  total: number;
}

export interface AIUsageStats {
  provider: AIProviderType;
  model: string;
  date: string;
  total_requests: number;
  total_tokens: number;
  success_count: number;
  failure_count: number;
  avg_latency_ms: number;
}

export interface GetUsageResponse {
  stats: AIUsageStats[];
  providers: AIProviderType[];
}

// AI History Response Types
export interface ListGenerationHistoryResponse {
  history: GenerationHistory[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListImportHistoryResponse {
  history: ImportHistory[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListCoverageAnalysisResponse {
  analyses: CoverageAnalysis[];
  total: number;
  limit: number;
  offset: number;
}

// Contract Interactions Response Types
export interface ListInteractionsResponse {
  interactions: Interaction[];
  total: number;
  limit: number;
  offset: number;
}

// Collection Types
export interface Collection {
  id: string;
  name: string;
  description: string;
  icon?: string;
  color?: string;
  parent_id?: string;
  sort_order: number;
  variables: CollectionVariables;
  auth: CollectionAuth;
  flows?: Flow[];
  children?: Collection[];
  created_at: string;
  updated_at: string;
}

export interface CollectionVariables {
  environment?: Record<string, any>;
  global?: Record<string, any>;
}

export interface CollectionAuth {
  type: 'none' | 'basic' | 'bearer' | 'api_key' | 'oauth2';
  inherit?: boolean;
  basic?: {
    username: string;
    password: string;
  };
  bearer?: {
    token: string;
    prefix?: string;
  };
  api_key?: {
    key: string;
    value: string;
    in: 'header' | 'query';
  };
  oauth2?: {
    grant_type: 'authorization_code' | 'client_credentials' | 'password' | 'implicit';
    client_id: string;
    client_secret?: string;
    auth_url?: string;
    token_url?: string;
    redirect_uri?: string;
    scope?: string;
    access_token?: string;
    refresh_token?: string;
    token_expiry?: string;
  };
}

export interface CollectionTreeNode {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  type: 'collection' | 'flow';
  sort_order: number;
  children?: CollectionTreeNode[];
  flow_id?: string;
}

// Collection API Requests/Responses
export interface CreateCollectionRequest {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  parent_id?: string;
  variables?: CollectionVariables;
  auth?: CollectionAuth;
}

export interface UpdateCollectionRequest {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  variables?: CollectionVariables;
  auth?: CollectionAuth;
}

export interface ListCollectionsResponse {
  collections: Collection[];
  total: number;
  limit: number;
  offset: number;
}

export interface GetCollectionTreeResponse {
  tree: CollectionTreeNode[];
}

export interface AddFlowToCollectionRequest {
  flow_id: string;
  sort_order?: number;
}

export interface MoveCollectionRequest {
  parent_id?: string | null;
  sort_order?: number;
}

export interface ReorderItemsRequest {
  items: Array<{
    id: string;
    sort_order: number;
  }>;
}
