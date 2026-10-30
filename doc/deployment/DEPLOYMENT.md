# Deployment

So you've got DeviceHub running via `stf local` and now you'd like to deploy it to real servers. \

DeviceHub consists of multiple independent processes communicating via [ZeroMQ](http://zeromq.org/) and [Protocol Buffers](https://github.com/google/protobuf). We call each process a "unit" to match systemd terminology.

Each unit and its function will be explained later in the document.

The market name shown in the UI is taken from the device settings (if the vendor's market name is available via `settings get global device_name`). To show a different market name, change the device settings.

DeviceHub can be deployed in several ways

* [Deployment by docker-compose for linux and macOS](docker-compose.md)
* [Deployment by systemd units legacy way](systemd.md)
* Deployment by helm in k8s

Units described [here](../units-describe.md)