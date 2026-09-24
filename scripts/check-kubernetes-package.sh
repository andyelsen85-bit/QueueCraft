#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
archive="$root/deliverables/queuecraft-kubernetes-deployment.zip"
source="$root/deploy/kubernetes/kustomize/base/deployment.yml"

if ! unzip -p "$archive" base/deployment.yml | cmp -s - "$source"; then
  echo "The packaged Kubernetes deployment differs from deploy/kubernetes/kustomize/base/deployment.yml." >&2
  echo "Refresh the ZIP's base/deployment.yml before distributing it." >&2
  exit 1
fi

echo "Packaged Kubernetes deployment matches the source manifest."