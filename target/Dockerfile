# Pin a specific patch release for reproducible builds; for full immutability
# replace the tag with a @sha256 digest.
FROM node:26.9-alpine
WORKDIR /app
COPY *.mjs ./
# Normalize perms: COPY inherits the host file mode, which on a restrictive
# umask (0600) leaves the sources unreadable by the non-root runtime user.
RUN chmod -R a+rX /app
USER node
CMD ["node", "receiver.mjs"]
