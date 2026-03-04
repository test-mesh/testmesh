# TestMesh Security Guidelines

> **Security is not optional. These rules MUST be followed from day one.**

**Version**: 1.0
**Date**: 2026-02-11
**Status**: Mandatory ✅
**Compliance**: OWASP Top 10

---

## Core Security Principles

### Security by Default

1. **Secure is the default** - Never "fix security later"
2. **Defense in depth** - Multiple layers of security
3. **Least privilege** - Minimal access rights
4. **Fail securely** - Errors don't expose information
5. **No security through obscurity** - Assume attacker knows the code

---

## Mandatory Rules (MUST Follow)

### 🚨 Rule 1: NEVER Commit Secrets

**NEVER commit to code**:
- ❌ API keys
- ❌ Passwords
- ❌ Private keys
- ❌ Certificates
- ❌ Tokens
- ❌ Connection strings with credentials
- ❌ Encryption keys
- ❌ OAuth secrets

**How to Handle Secrets**:

✅ **USE Environment Variables**:
```go
// Good ✅
apiKey := os.Getenv("API_KEY")
if apiKey == "" {
    return errors.New("API_KEY environment variable required")
}
```

```typescript
// Good ✅
const apiKey = process.env.API_KEY;
if (!apiKey) {
    throw new Error('API_KEY environment variable required');
}
```

❌ **DON'T Hardcode**:
```go
// Bad ❌
apiKey := "sk_live_51Hx..." // NEVER do this!
```

**Use Secret Management**:
- Development: `.env` files (git-ignored)
- Staging/Production: Vault, AWS Secrets Manager, GCP Secret Manager
- Kubernetes: Sealed Secrets or External Secrets Operator

**Check Before Commit**:
```bash
# Add pre-commit hook to detect secrets
npm install --save-dev @commitlint/cli
# Or use tools like git-secrets, detect-secrets
```

---

### 🚨 Rule 2: Validate ALL User Input

**Trust NOTHING from users.**

**Input Validation Rules**:
1. ✅ Validate type (string, number, email, URL)
2. ✅ Validate length (min/max)
3. ✅ Validate format (regex, enum)
4. ✅ Validate range (numbers)
5. ✅ Sanitize before use

**Backend Validation (Go)**:
```go
// Good ✅
func CreateUser(req *CreateUserRequest) error {
    // Validate email
    if !isValidEmail(req.Email) {
        return errors.New("invalid email format")
    }

    // Validate length
    if len(req.Password) < 8 {
        return errors.New("password must be at least 8 characters")
    }

    // Validate format
    if !regexp.MustCompile(`^[a-zA-Z0-9_]+$`).MatchString(req.Username) {
        return errors.New("username can only contain letters, numbers, and underscores")
    }

    // Sanitize
    req.Username = strings.TrimSpace(req.Username)

    // Proceed with creation
    return createUserInDB(req)
}
```

**Frontend Validation (TypeScript)**:
```typescript
// Use Zod for validation
import { z } from 'zod';

const CreateUserSchema = z.object({
    email: z.string().email(),
    username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
    password: z.string().min(8),
});

function createUser(data: unknown) {
    // Validate ✅
    const validated = CreateUserSchema.parse(data);

    // Use validated data
    return api.post('/users', validated);
}
```

**NEVER Trust**:
- ❌ URL parameters
- ❌ Request body
- ❌ Query strings
- ❌ Headers
- ❌ Cookies
- ❌ File uploads

---

### 🚨 Rule 3: Prevent SQL Injection

**ALWAYS use parameterized queries.**

**Good ✅ - Parameterized Queries**:
```go
// PostgreSQL with parameters ✅
query := "SELECT * FROM users WHERE email = $1"
rows, err := db.Query(query, email)

// Multiple parameters ✅
query := "SELECT * FROM orders WHERE user_id = $1 AND status = $2"
rows, err := db.Query(query, userID, status)
```

**Bad ❌ - String Concatenation**:
```go
// NEVER do this! ❌
query := "SELECT * FROM users WHERE email = '" + email + "'"
rows, err := db.Query(query) // Vulnerable to SQL injection!
```

**Attack Example**:
```
Input: email = "user@example.com' OR '1'='1"
Bad Query: SELECT * FROM users WHERE email = 'user@example.com' OR '1'='1'
Result: Returns ALL users! 🚨
```

**ORM Usage** (Still validate input):
```go
// GORM ✅
db.Where("email = ?", email).First(&user)

// NEVER use user input directly in Where ❌
db.Where(fmt.Sprintf("email = '%s'", email)).First(&user)
```

---

### 🚨 Rule 4: Prevent XSS (Cross-Site Scripting)

**Sanitize ALL output to HTML.**

**React (Automatic escaping)** ✅:
```tsx
// React automatically escapes ✅
<div>{userInput}</div>
// "<script>alert('xss')</script>" becomes:
// "&lt;script&gt;alert('xss')&lt;/script&gt;"
```

**Dangerous HTML (Be careful)** ⚠️:
```tsx
// Only use if content is TRUSTED and SANITIZED
<div dangerouslySetInnerHTML={{ __html: sanitizedHTML }} />
```

**Sanitization Library**:
```typescript
import DOMPurify from 'isomorphic-dompurify';

// Sanitize before rendering ✅
const clean = DOMPurify.sanitize(userInput);
```

**Backend (Go)** ✅:
```go
import "html"

// Escape HTML
escaped := html.EscapeString(userInput)

// Use in templates (auto-escaping)
tmpl.Execute(w, data) // Templates auto-escape by default
```

**Cookie Security**:
```typescript
// Set secure cookies ✅
res.cookie('session', token, {
    httpOnly: true,    // Not accessible via JavaScript
    secure: true,      // HTTPS only
    sameSite: 'strict', // CSRF protection
    maxAge: 3600000    // 1 hour
});
```

---

### 🚨 Rule 5: CSRF Protection

**Protect ALL state-changing endpoints.**

**Implementation**:
```typescript
// Use CSRF token middleware
import csrf from 'csurf';

app.use(csrf({ cookie: true }));

// Include token in forms
<form method="post">
    <input type="hidden" name="_csrf" value={csrfToken} />
</form>

// Or in headers
axios.post('/api/users', data, {
    headers: { 'X-CSRF-Token': csrfToken }
});
```

**REST API** (Token-based):
```go
// Verify CSRF token on state-changing operations
func CreateUser(c *gin.Context) {
    token := c.GetHeader("X-CSRF-Token")
    if !verifyCSRFToken(token) {
        c.JSON(403, gin.H{"error": "invalid CSRF token"})
        return
    }

    // Proceed with creation
}
```

**CSRF Protection Rules**:
- ✅ GET requests should be read-only (idempotent)
- ✅ POST, PUT, DELETE require CSRF token
- ✅ Use SameSite cookies
- ✅ Verify Origin/Referer headers

---

### 🚨 Rule 6: Hash Passwords Securely

**NEVER store plain text passwords.**

**Use bcrypt** (Recommended):
```go
import "golang.org/x/crypto/bcrypt"

// Hash password ✅
func HashPassword(password string) (string, error) {
    // Cost 12 is recommended (2^12 iterations)
    hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
    return string(hash), err
}

// Verify password ✅
func VerifyPassword(hash, password string) bool {
    err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
    return err == nil
}
```

**Password Requirements**:
```go
func ValidatePassword(password string) error {
    if len(password) < 8 {
        return errors.New("password must be at least 8 characters")
    }

    // Check for complexity
    hasUpper := regexp.MustCompile(`[A-Z]`).MatchString(password)
    hasLower := regexp.MustCompile(`[a-z]`).MatchString(password)
    hasNumber := regexp.MustCompile(`[0-9]`).MatchString(password)

    if !hasUpper || !hasLower || !hasNumber {
        return errors.New("password must contain uppercase, lowercase, and numbers")
    }

    return nil
}
```

**DON'T**:
- ❌ Store passwords in plain text
- ❌ Use MD5 or SHA1 (too fast, easily cracked)
- ❌ Use encryption (reversible)
- ❌ Log passwords (even hashed)

---

### 🚨 Rule 7: Use HTTPS Everywhere

**Production MUST use HTTPS.**

**Enforce HTTPS** (Go):
```go
// Redirect HTTP to HTTPS
func RedirectToHTTPS(c *gin.Context) {
    if c.Request.Header.Get("X-Forwarded-Proto") != "https" {
        httpsURL := "https://" + c.Request.Host + c.Request.RequestURI
        c.Redirect(301, httpsURL)
        return
    }
    c.Next()
}

// Use middleware
router.Use(RedirectToHTTPS)
```

**HSTS Header**:
```go
// Enforce HTTPS for 1 year
c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
```

**Development**:
- ✅ Use HTTPS in development too (self-signed certs)
- ✅ Test with real HTTPS behavior

---

### 🚨 Rule 8: Rate Limiting

**Prevent abuse of ALL public endpoints.**

**Implementation** (Go):
```go
import "golang.org/x/time/rate"

// Create rate limiter
var limiter = rate.NewLimiter(10, 100) // 10 req/sec, burst 100

// Middleware
func RateLimitMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        if !limiter.Allow() {
            c.JSON(429, gin.H{
                "error": "rate limit exceeded",
                "retry_after": 60,
            })
            c.Abort()
            return
        }
        c.Next()
    }
}
```

**Per-User Rate Limiting**:
```go
// Use Redis for distributed rate limiting
func RateLimitByUser(userID string) bool {
    key := fmt.Sprintf("rate_limit:%s", userID)
    count, _ := redisClient.Incr(ctx, key).Result()

    if count == 1 {
        redisClient.Expire(ctx, key, time.Minute)
    }

    return count <= 100 // 100 requests per minute
}
```

**Rate Limit Rules**:
- ✅ Auth endpoints: 5 attempts per 15 minutes
- ✅ API endpoints: 100 requests per minute per user
- ✅ Public endpoints: 10 requests per second per IP
- ✅ File uploads: 10 per hour per user

---

### 🚨 Rule 9: Authentication & Authorization

**Verify permissions on EVERY request.**

**Authentication**:
```go
// JWT middleware
func AuthMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        token := c.GetHeader("Authorization")
        if token == "" {
            c.JSON(401, gin.H{"error": "unauthorized"})
            c.Abort()
            return
        }

        // Verify JWT
        claims, err := verifyJWT(token)
        if err != nil {
            c.JSON(401, gin.H{"error": "invalid token"})
            c.Abort()
            return
        }

        // Set user context
        c.Set("user_id", claims.UserID)
        c.Next()
    }
}
```

**Authorization**:
```go
// Check permissions
func RequireRole(role string) gin.HandlerFunc {
    return func(c *gin.Context) {
        userID := c.GetString("user_id")

        hasRole, err := checkUserRole(userID, role)
        if err != nil || !hasRole {
            c.JSON(403, gin.H{"error": "forbidden"})
            c.Abort()
            return
        }

        c.Next()
    }
}

// Use in routes
router.DELETE("/api/users/:id",
    AuthMiddleware(),
    RequireRole("admin"),
    DeleteUser,
)
```

**Rules**:
- ✅ Verify authentication on ALL protected endpoints
- ✅ Check authorization (permissions) for actions
- ✅ Use principle of least privilege
- ✅ Don't trust client-side checks

---

### 🚨 Rule 10: Log Security Events

**Track security-relevant events.**

**What to Log**:
```go
// Authentication events
log.Info("user_login", map[string]interface{}{
    "user_id": userID,
    "ip": request.RemoteAddr,
    "timestamp": time.Now(),
    "success": true,
})

// Failed authentication
log.Warn("login_failed", map[string]interface{}{
    "email": email,
    "ip": request.RemoteAddr,
    "reason": "invalid_password",
})

// Authorization failures
log.Warn("access_denied", map[string]interface{}{
    "user_id": userID,
    "resource": resource,
    "action": action,
    "reason": "insufficient_permissions",
})

// Security events
log.Error("suspicious_activity", map[string]interface{}{
    "user_id": userID,
    "activity": "rapid_requests",
    "count": requestCount,
})
```

**What NOT to Log**:
- ❌ Passwords (plain or hashed)
- ❌ Credit card numbers
- ❌ API keys / tokens
- ❌ Session IDs
- ❌ Personal information (PII)

**Log Safely**:
```go
// Good ✅
log.Info("user_updated", map[string]interface{}{
    "user_id": userID,
    "fields_updated": []string{"email", "name"},
})

// Bad ❌
log.Info("user_updated", user) // May contain sensitive data
```

---

## Security Checklist (Per Phase)

### Before Every PR

**Code Review Checklist**:
- [ ] No hardcoded secrets
- [ ] All user input validated
- [ ] SQL injection prevented (parameterized queries)
- [ ] XSS prevented (sanitized output)
- [ ] CSRF protection on state-changing endpoints
- [ ] Passwords hashed with bcrypt
- [ ] HTTPS enforced (production)
- [ ] Rate limiting implemented
- [ ] Authentication checked
- [ ] Authorization verified
- [ ] Security events logged
- [ ] No sensitive data in logs
- [ ] Error messages don't leak information
- [ ] Dependencies scanned for vulnerabilities

### Phase-Specific Checks

**Phase 1 (Foundation)**:
- [ ] Secure database connection (TLS)
- [ ] Environment variable validation
- [ ] Secrets management configured
- [ ] Authentication system secure (bcrypt, JWT)

**Phase 2 (Core Engine)**:
- [ ] Action handlers validate input
- [ ] SQL queries parameterized
- [ ] HTTP requests use TLS
- [ ] Error handling doesn't expose internals

**Phase 3 (Observability)**:
- [ ] Logs don't contain secrets
- [ ] Artifacts stored securely
- [ ] Dashboard authentication required
- [ ] WebSocket connections authenticated

**Phase 4 (Advanced Features)**:
- [ ] Plugin sandboxing implemented
- [ ] Mock servers isolated
- [ ] Contract testing doesn't expose secrets
- [ ] Reports don't contain sensitive data

**Phase 5 (AI Integration)**:
- [ ] AI requests don't send secrets
- [ ] Generated code reviewed for security
- [ ] API keys encrypted at rest
- [ ] User data anonymized before AI processing

**Phase 6 (Production Hardening)**:
- [ ] Security audit completed
- [ ] Penetration testing done
- [ ] OWASP Top 10 verified
- [ ] Secrets rotation implemented
- [ ] Security monitoring configured

---

## OWASP Top 10 Coverage

### A01: Broken Access Control
- ✅ Authentication on all protected endpoints
- ✅ Authorization checks for actions
- ✅ Principle of least privilege
- ✅ No client-side access control only

### A02: Cryptographic Failures
- ✅ HTTPS everywhere
- ✅ Bcrypt for passwords
- ✅ Secure random for tokens
- ✅ No weak encryption

### A03: Injection
- ✅ Parameterized SQL queries
- ✅ Input validation
- ✅ Output sanitization
- ✅ No eval() or exec()

### A04: Insecure Design
- ✅ Security by design (not afterthought)
- ✅ Threat modeling
- ✅ Defense in depth
- ✅ Fail securely

### A05: Security Misconfiguration
- ✅ No default passwords
- ✅ Error messages don't leak info
- ✅ Security headers configured
- ✅ Unnecessary features disabled

### A06: Vulnerable Components
- ✅ Dependencies scanned
- ✅ Regular updates
- ✅ Known vulnerabilities checked
- ✅ Minimal dependencies

### A07: Identification and Authentication Failures
- ✅ Strong password requirements
- ✅ Rate limiting on auth
- ✅ No credential stuffing
- ✅ Secure session management

### A08: Software and Data Integrity Failures
- ✅ Code signing
- ✅ Dependency verification
- ✅ CI/CD pipeline security
- ✅ No unsigned code execution

### A09: Security Logging and Monitoring Failures
- ✅ Security events logged
- ✅ Alerting configured
- ✅ Anomaly detection
- ✅ Audit trail

### A10: Server-Side Request Forgery (SSRF)
- ✅ URL validation
- ✅ Whitelist allowed domains
- ✅ No user-controlled URLs
- ✅ Network segmentation

---

## Security Tools

### Pre-Commit Hooks
```bash
# Install
npm install --save-dev husky lint-staged

# Configure .husky/pre-commit
#!/bin/sh
npm run lint
npm run test:security
```

### Dependency Scanning
```bash
# Go
go install github.com/sonatype-nexus-community/nancy@latest
go list -json -m all | nancy sleuth

# JavaScript
npm audit
npm audit fix

# Automated in CI/CD
- name: Security scan
  run: |
    npm audit --audit-level=moderate
    go run github.com/securego/gosec/v2/cmd/gosec@latest ./...
```

### Static Analysis
```bash
# Go security checker
go install github.com/securego/gosec/v2/cmd/gosec@latest
gosec ./...

# JavaScript/TypeScript
npm install --save-dev eslint-plugin-security
```

### Runtime Monitoring
```yaml
# Example: Falco rules for Kubernetes
- rule: Sensitive file opened for reading
  condition: open_read and sensitive_files
  output: "Sensitive file opened (user=%user.name file=%fd.name)"
```

---

## Incident Response

### Security Incident Process

1. **Detect**: Monitor, alert, investigate
2. **Contain**: Limit damage, isolate affected systems
3. **Eradicate**: Remove threat, patch vulnerability
4. **Recover**: Restore services, verify security
5. **Learn**: Post-mortem, update procedures

### Security Contact

**Report vulnerabilities to**:
- Email: security@testmesh.io
- PGP Key: [Link to public key]
- Responsible disclosure: 90 days

---

## Summary

### Quick Security Checklist

Before every commit:
- [ ] No secrets in code
- [ ] Input validated
- [ ] SQL parameterized
- [ ] Output sanitized
- [ ] CSRF protected
- [ ] Passwords hashed
- [ ] HTTPS used
- [ ] Rate limited
- [ ] Auth/authz checked
- [ ] Security logged
- [ ] Dependencies scanned

**Remember**:
- 🚨 Security is MANDATORY, not optional
- 🚨 Security from day one, not "later"
- 🚨 When in doubt, ASK (don't guess)
- 🚨 Fail securely, not open

---

**Version**: 1.0
**Last Updated**: 2026-02-11
**Status**: Mandatory ✅
**Compliance**: OWASP Top 10
