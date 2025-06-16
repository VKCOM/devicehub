# Migration from SystemD to Docker Compose

If you're currently using systemd deployment, here's how the services map:

| SystemD Unit              | Docker Compose Service   | Key Changes                             |
|--------------------------|--------------------------|------------------------------------------|
| adbd.service             | adbd                     | No manual port binding needed            |
| stf-app@.service         | devicehub-app            | Environment variables from file          |
| stf-auth@.service        | devicehub-auth           | Automatic service discovery              |
| stf-api@.service         | devicehub-api            | ZeroMQ endpoints use service names       |
| stf-provider@.service    | devicehub-provider       | Simplified ADB connectivity              |
| stf-triproxy-*.service   | devicehub-triproxy-*     | Automatic port management                |


# Migration Steps:

* Export current environment variables to scripts/variables.env
* Stop all systemd units
* Deploy using docker-compose
* Update any external references to use new service endpoints