#!/bin/bash
# Runs the load generator inside the Docker network (ktd-load-net), bypassing the Mac port forwarder.
# Numbers from this path cover the Docker-internal network only (no Caddy, TLS or internet hop).
# usage: ./gen.sh s1|s2|s3|s4 [-e S2_SECONDS=60 ...]
# The docker socket is mounted only so S3 can kill and start the ktd-load container.
set -e
sc=$1; shift
cd "$(dirname "$0")"
docker run --rm --name ktd-load-gen --network ktd-load-net --user "$(id -u):$(id -g)" --group-add 0 \
  -v "$PWD":/app -w /app -v /var/run/docker.sock:/var/run/docker.sock -e LOAD_URL=http://ktd-load:4100 "$@" node:22-slim node run.ts "$sc"
