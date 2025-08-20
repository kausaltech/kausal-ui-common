#!/bin/sh

CACHE_DIR=$(pwd)/.next/cache

if [ -f pnpm-lock.yaml ] ; then
  lock_file=pnpm-lock.yaml
else
  lock_file=package-lock.json
fi

PACKAGE_LOCK_HASH=$(sha1sum $lock_file)
PACKAGE_LOCK_HASH_FILE=${CACHE_DIR}/package-lock-hash.txt

if [ "$1" = 'check' ] ; then
  if [ -f "$PACKAGE_LOCK_HASH_FILE" ] ; then
    if [ "$PACKAGE_LOCK_HASH" != "$(cat "$PACKAGE_LOCK_HASH_FILE")" ] ; then
      echo "${PACKAGE_LOCK_HASH_FILE}" changed, clearing NextJS cache
      # shellcheck disable=SC2115
      rm -rf "${CACHE_DIR}"/*
    else
      echo "NextJS cache:"
      du -c "${CACHE_DIR}"
    fi
  else
    echo "No existing cache found"
  fi
elif [ "$1" = 'save' ] ; then
  echo -n "$PACKAGE_LOCK_HASH" > "$PACKAGE_LOCK_HASH_FILE"
  echo "Saving NextJS cache:"
  du -c "${CACHE_DIR}"
fi
