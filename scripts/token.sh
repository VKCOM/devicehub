#!/bin/bash
respJwt=$(curl --location 'devicehub:7100/auth/api/v1/mock' \
--header 'Content-Type: application/json' \
--data-raw '{
"name": "administrator",
"email": "administrator@fakedomain.com"
}')
echo "respJwt=$respJwt"
jwt=$(echo "$respJwt" | jq '.jwt' -r )
echo "jwt=$jwt"
if [ -n "jwt" ]; then
  echo "Using jwt = $jwt"
else
  echo "Jwt is empty"
  echo "##teamcity[buildStop comment='There is no token for API tests' readdToQueue='false']"
  exit 1
fi
export STF_TOKEN=$jwt
