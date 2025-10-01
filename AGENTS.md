# Architecture Patterns

## Layered Architecture

The codebase follows a layered architecture pattern with clear separation of concerns:

- **Repository Layer** (`*.repo.ts`): Raw database operations and data access
  - Contains basic CRUD operations
  - Direct database queries using the ORM
  - No business logic

- **Service Layer** (`*.service.ts`): Business logic and orchestration
  - Coordinates multiple repository calls
  - Handles validation and business rules
  - Transforms data between layers
  - Generates IDs and handles side effects

- **UI Layer**: Components and user interface
  - Should interact with Service layer, not Repository layer directly
  - Focuses on presentation and user interaction
  - Minimal business logic

### Example
```typescript
// ❌ UI calling repo directly
const tag = await TagRepo.create({ id: nanoid(), name: props.query.trim() });

// ✅ UI calling service
const tag = await TagService.create(props.query);
```

This pattern ensures maintainability, testability, and clear boundaries between different concerns.
