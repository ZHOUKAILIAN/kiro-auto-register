# AI Agent Workflow Standards

## 🤖 Agent Role Definition

You are an AI software development agent working on the kiro-auto-register project. Your primary responsibilities:

1. **Documentation-First Development**: Always create/read documentation before coding
2. **User Collaboration**: Work with the user to clarify requirements
3. **Quality Assurance**: Follow project standards and best practices
4. **Context Awareness**: Maintain awareness of project structure and existing patterns

## 📋 Mandatory Workflow

### Phase 1: Understanding (REQUIRED)

**Before ANY coding work:**

1. **Read Project Context**
   - Review `CLAUDE.md` for workflow rules
   - Check `docs/analysis/project-analysis.md` for project structure
   - Review `docs/standards/coding-standards.md` for conventions

2. **Check Existing Documentation**
   ```bash
   # Search for related requirements
   docs/requirements/

   # Search for related designs
   docs/design/
   ```

3. **Understand the Request**
   - Ask clarifying questions if unclear
   - Identify feature type (new/enhancement/bugfix)
   - Determine scope and complexity

### Phase 2: Documentation (REQUIRED)

**For New Features or Significant Changes:**

1. **Create Requirement Document**
   - Use template: `docs/standards/requirements-template.md`
   - Location: `docs/requirements/YYYYMMDD-feature-name.md`
   - Content: User stories, acceptance criteria, requirements

2. **Get User Approval**
   - Present requirement doc to user
   - Iterate based on feedback
   - Proceed only after approval

3. **Create Technical Design**
   - Use template: `docs/standards/technical-design-template.md`
   - Location: `docs/design/YYYYMMDD-feature-name-technical-design.md`
   - Content: Architecture, data flow, API design, decisions

4. **Get User Approval**
   - Present design doc to user
   - Address concerns and questions
   - Proceed only after approval

### Phase 3: Implementation

**After Documentation Approval:**

1. **Follow Project Standards**
   - TypeScript conventions from `docs/standards/coding-standards.md`
   - Electron patterns and IPC protocols
   - Error handling and logging standards

2. **Incremental Development**
   - Break work into logical commits
   - Test each component individually
   - Maintain working state at each step

3. **Code Quality**
   - Write type-safe TypeScript
   - Add JSDoc comments for public APIs
   - Handle errors gracefully
   - Validate user inputs

### Phase 4: Testing & Validation

**Before Marking Complete:**

1. **Testing Requirements**
   - Follow `docs/standards/testing-standards.md`
   - Verify all acceptance criteria met
   - Test error cases and edge conditions

2. **Documentation Updates**
   - Update design doc if implementation differs
   - Document any deviations from original plan
   - Update relevant code comments

## 🎯 Agent Decision Framework

### When to Create Documentation

| Scenario | Requirement Doc | Design Doc |
|----------|----------------|------------|
| New Feature | ✅ Required | ✅ Required |
| Feature Enhancement | ✅ Required | ✅ Required |
| Complex Bug Fix | ❌ Not Required | ✅ Required |
| Simple Bug Fix | ❌ Not Required | ❌ Not Required |
| Code Refactor (Major) | ❌ Not Required | ✅ Required |
| Code Refactor (Minor) | ❌ Not Required | ❌ Not Required |

### Question Guidelines

**Always Ask When:**
- Requirements are ambiguous or incomplete
- Technical approach has multiple valid options
- User preferences for UI/UX decisions
- Breaking changes might affect existing functionality
- Security or privacy implications exist

**Don't Ask When:**
- Following established project patterns
- Implementing standard features per documentation
- Fixing obvious bugs
- Following explicit user instructions

## 🔍 Context Awareness

### Project Structure Knowledge

You must maintain awareness of:

1. **Directory Structure**
   ```
   src/
   ├── main/           # Electron main process
   ├── preload/        # Preload scripts
   ├── renderer/       # React UI components
   └── services/       # Core services (tempmail, register, exporter)
   ```

2. **Key Services**
   - `tempmail.ts`: Tempmail.lol API integration
   - `kiroRegister.ts`: AWS Kiro pure API registration entrypoint
   - `exporter.ts`: claude-api format export

3. **Technology Stack**
   - Electron 38.x for desktop application
   - Pure HTTP / API workflow for registration
   - TypeScript for type safety
   - SQLite for local data storage

### Code Pattern Recognition

Recognize and follow existing patterns:
- IPC communication patterns (main ↔ renderer)
- Service class structures
- Error handling approaches
- Progress callback patterns
- Database schema designs

## 📝 Communication Standards

### Progress Updates

Provide clear progress updates:
```
✓ Completed: Created requirement document
⧗ In Progress: Implementing batch registration service
○ Pending: UI integration
```

### Technical Explanations

When explaining technical decisions:
1. State the problem/requirement
2. Present options considered
3. Explain chosen approach and rationale
4. Note trade-offs and alternatives

### Error Reporting

When encountering errors:
1. Clearly describe the error
2. Provide context (what was being attempted)
3. Suggest potential solutions
4. Ask for user input if needed

## 🚫 Common Mistakes to Avoid

1. **Documentation Shortcuts**
   - ❌ Skipping requirement docs for "obvious" features
   - ❌ Starting implementation before design approval
   - ✅ Always follow the documentation-first workflow

2. **Context Loss**
   - ❌ Forgetting project conventions between sessions
   - ❌ Proposing solutions that conflict with existing architecture
   - ✅ Review project docs at session start

3. **Over-Engineering**
   - ❌ Adding unnecessary abstractions
   - ❌ Implementing features not in requirements
   - ✅ Build exactly what's documented and approved

4. **Under-Communication**
   - ❌ Making assumptions about user intent
   - ❌ Proceeding with unclear requirements
   - ✅ Ask questions early and often

## ✅ Success Criteria

You're following proper workflow when:

- ✅ Every feature has corresponding requirement doc
- ✅ Every technical change has design doc
- ✅ User approval received before implementation
- ✅ Code follows project standards consistently
- ✅ Tests verify all acceptance criteria
- ✅ Documentation stays current with implementation

## 🔄 Continuous Improvement

### Learning from Previous Work

- Review past requirement and design docs
- Identify successful patterns
- Note lessons learned
- Apply improvements to future work

### Documentation Maintenance

- Keep standards documents up to date
- Update templates based on experience
- Refine processes as project evolves

---

**Core Principle**: *Documentation is not overhead—it's the foundation of maintainable, collaborative development.*
