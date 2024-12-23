#!/bin/bash
sleep 10

mongosh --host 10.211.0.2:27017 <<EOF
  var cfg = {
    "_id": "myReplicaSet",
    "version": 1,
    "members": [
      {
        "_id": 0,
        "host": "10.211.0.2:27017",
        "priority": 2
      },
      {
        "_id": 1,
        "host": "10.211.0.3:27017",
        "priority": 0
      },
      {
        "_id": 2,
        "host": "10.211.0.4:27017",
        "priority": 0
      }
    ]
  };
  rs.initiate(cfg);
EOF
