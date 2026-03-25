# AWS Kiro Auto Register - Initial Requirements

**Date**: 2026-03-25
**Status**: Approved (Initial Version)
**Author**: ZHOUKAILIAN

> Implementation Note:
> This document records the broader initial direction for the project.
> The implemented 2026-03-25 delivery is scoped by `20260325-kiro-register-capability.md`,
> which keeps browser-based registration and adds API-based credential exchange plus target-system integration.

## 📋 Overview

### Background
AWS Kiro (Amazon Q Developer) provides developer tools and requires account registration. Manual registration is time-consuming and repetitive. This project aims to automate the registration process and integrate with claude-api account pool management system.

### Objectives
- **Primary Goal**: Fully automate AWS Kiro account registration
- **Secondary Goals**:
  - Integrate with Tempmail.lol for disposable email addresses
  - Export accounts in claude-api compatible format
  - Support batch registration
  - Provide desktop application interface
- **Success Metrics**:
  - Registration success rate > 90%
  - Average registration time < 3 minutes
  - Zero manual intervention required

## 👥 User Stories

### User Story 1: Single Account Registration
**As a** developer
**I want** to register a single AWS Kiro account automatically
**So that** I can quickly obtain working credentials without manual steps

**Acceptance Criteria**:
- [x] System creates temporary email automatically
- [x] System navigates to AWS registration page
- [x] System fills in required information
- [x] System handles email verification
- [x] System extracts SSO token
- [ ] UI shows registration progress in real-time
- [ ] Result saved to local database

### User Story 2: Batch Registration
**As a** power user
**I want** to register multiple accounts in parallel
**So that** I can build up an account pool efficiently

**Acceptance Criteria**:
- [ ] Support configurable concurrency (3-5 parallel)
- [ ] Queue management for pending registrations
- [ ] Progress tracking for each registration
- [ ] Error handling and retry mechanism
- [ ] Summary report of successful/failed registrations

### User Story 3: Account Management
**As a** user
**I want** to view and manage my registered accounts
**So that** I can track which accounts are available

**Acceptance Criteria**:
- [ ] List all registered accounts
- [ ] Show account status (active, expired, invalid)
- [ ] Search and filter accounts
- [ ] Delete accounts
- [ ] Export selected accounts

### User Story 4: Export to claude-api
**As a** user
**I want** to export accounts in claude-api format
**So that** I can import them into my account pool management system

**Acceptance Criteria**:
- [x] Export format matches claude-api spec
- [x] Support single account export
- [x] Support batch export
- [ ] Direct API integration with claude-api
- [ ] Export history tracking

## 🎯 Functional Requirements

### FR-1: Temporary Email Integration
**Priority**: High
**Description**: Integrate with Tempmail.lol API to create disposable email addresses for registration.

**Details**:
- Input: API request to Tempmail.lol
- Processing: Create inbox, wait for verification email, extract code
- Output: Email address and verification code

**Edge Cases**:
- Email not received within timeout (120s)
- Invalid or malformed verification code
- API rate limiting or errors

### FR-2: AWS Kiro Registration Automation
**Priority**: High
**Description**: **UPDATED**: Use AWS Kiro API directly instead of browser automation

**Details**:
- Input: Email address, name, verification code
- Processing: Direct API calls to AWS registration endpoints
- Output: SSO token, client credentials

**API Flow** (to be researched):
1. POST registration request with email
2. Verify email with code
3. Complete registration with password
4. Extract credentials from response

**Edge Cases**:
- Registration page changed
- Verification code timeout
- Password requirements changed
- Cookie/session handling

**Note**: This requirement has been updated per user request to use API-based approach instead of the old page automation path.

### FR-3: Account Storage
**Priority**: High
**Description**: Store registered accounts in local SQLite database.

**Details**:
- Input: Registration result (email, SSO token, credentials)
- Processing: Save to database with timestamp
- Output: Database record with unique ID

**Schema**:
```sql
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password TEXT ENCRYPTED,
  sso_token TEXT,
  client_id TEXT,
  client_secret TEXT,
  refresh_token TEXT,
  created_at INTEGER,
  status TEXT DEFAULT 'active'
);
```

**Edge Cases**:
- Duplicate email addresses
- Database corruption
- Concurrent writes

### FR-4: Export Functionality
**Priority**: Medium
**Description**: Export accounts in claude-api compatible JSON format.

**Details**:
- Input: Account IDs to export
- Processing: Format data according to spec
- Output: JSON file or API call

**Format**:
```json
{
  "refreshToken": "xxx",
  "clientId": "xxx",
  "clientSecret": "xxx",
  "provider": "BuilderId"
}
```

**Edge Cases**:
- Missing required fields
- File write permissions
- API endpoint unavailable

### FR-5: Batch Registration Queue
**Priority**: Medium
**Description**: Support concurrent registration of multiple accounts.

**Details**:
- Input: Number of accounts to register
- Processing: Queue management with concurrency limit
- Output: Array of registration results

**Concurrency**:
- Default: 3 parallel registrations
- Maximum: 5 (to avoid resource exhaustion)
- Configurable via settings

**Edge Cases**:
- System resource limits
- Network instability
- Partial failures

### FR-6: User Interface
**Priority**: Medium
**Description**: Electron desktop application with React UI.

**Features**:
- Registration form (single/batch)
- Account list with search/filter
- Progress visualization
- Export dialog
- Settings panel

**Edge Cases**:
- Window resize/minimize
- Application crashes
- IPC communication failures

## 🔧 Non-Functional Requirements

### Performance
- Registration time: < 3 minutes per account
- UI responsiveness: < 100ms for user interactions
- Database queries: < 50ms for common operations
- Memory usage: < 500MB for 5 concurrent registrations

### Security
- **Encryption**: Encrypt passwords and tokens at rest
- **No Logging**: Never log sensitive credentials
- **Memory Safety**: Clear sensitive data after use
- **Proxy Support**: Optional proxy for privacy

### Reliability
- **Success Rate**: > 90% registration success
- **Error Recovery**: Automatic retry with exponential backoff
- **Data Integrity**: ACID transactions for database
- **Graceful Degradation**: Continue with other registrations on failure

### Usability
- **Simple Interface**: One-click registration start
- **Progress Feedback**: Real-time status updates
- **Error Messages**: Clear, actionable error descriptions
- **Documentation**: Inline help and tooltips

### Maintainability
- **Code Quality**: TypeScript with strict mode
- **Test Coverage**: > 70% unit test coverage
- **Documentation**: JSDoc for all public APIs
- **Standards**: Follow project coding standards

## 📐 Constraints

### Technical Constraints
- Electron 38.x required for desktop app
- Node.js 18+ required
- Pure HTTP / API workflow for registration
- SQLite for local storage

### Business Constraints
- **Private Use**: Personal project, not for distribution
- **Rate Limits**: Respect Tempmail.lol API limits
- **Compliance**: Comply with AWS terms of service

### Resource Constraints
- Development: Single developer
- Timeline: Iterative development, no hard deadline
- Infrastructure: Local development only

## 🚫 Out of Scope

Explicitly NOT included in this version:
- Cloud deployment or SaaS offering
- Multi-user support or authentication
- Account usage tracking or analytics
- Automatic credential rotation
- Mobile application
- Chrome extension version
- Integration with other account management systems

## 📊 Acceptance Criteria

- [x] Tempmail.lol integration working
- [x] Basic registration automation implemented
- [x] Export format compatible with claude-api
- [ ] UI implemented with all core features
- [ ] Database schema created and tested
- [ ] Batch registration working with concurrency
- [ ] Error handling and retry mechanisms
- [ ] User documentation complete
- [ ] 70%+ test coverage achieved

## 🔗 Related Documents

- [Technical Design](../design/20260325-project-initial-requirements-technical-design.md) (To be created)
- [Project Analysis](../analysis/project-analysis.md)
- [Coding Standards](../standards/coding-standards.md)
- [Testing Standards](../standards/testing-standards.md)

## 📝 Notes

### Critical Change: API-Based Registration
**Date**: 2026-03-25
**Decision**: Replace the old page automation path with direct API calls

**Rationale**:
- Faster registration (no browser overhead)
- More reliable (no UI changes)
- Lower resource usage
- Better for batch operations

**Impact**:
- Need to reverse-engineer AWS registration API
- Update `kiroRegister.ts` service
- Remove the old registration dependency chain
- Update architecture documentation

### Dependencies
- **Tempmail.lol**: Critical for email verification
- **AWS Kiro API**: Need to document endpoint structure
- **claude-api**: Export format must match exactly

### Assumptions
- AWS registration API is accessible without browser
- Rate limiting allows batch registration
- Verification emails arrive within 2 minutes
- SSO tokens remain valid for reasonable time

---

**Review History**:
- 2026-03-25: Initial requirements documented
- 2026-03-25: Updated FR-2 to use API approach instead of the old page automation path
