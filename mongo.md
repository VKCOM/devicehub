## Transition to MongoDB

### Migration Process
We migrated the entire farm to MongoDB while preserving the existing logic and introducing optimizations.

### Requirements
To ensure proper functionality, MongoDB must run in replica set mode. The Docker Compose files use `mongo:7.0`, and the quick-start command in the README uses `mongo:6.0.10`.

### Data Migration
If you need to migrate data from RethinkDB, you can use the following command:

```bash
stf migrate-to-mongo
```
