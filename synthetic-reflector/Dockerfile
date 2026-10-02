# Pin a specific patch release for reproducible builds; for full immutability
# replace the tag with a @sha256 digest. Built from the ./lab context so the
# shared lib/ (net-guard) is available at ../lib relative to the module.
FROM node:26.10-alpine
WORKDIR /app
COPY lib ./lib
COPY synthetic-reflector/*.mjs ./synthetic-reflector/
COPY profiles.mjs ./
# Normalize perms: COPY inherits the host file mode, which on a restrictive
# umask (0600) leaves the sources unreadable by the non-root runtime user.
RUN chmod -R a+rX /app
USER node
CMD ["node", "synthetic-reflector/server.mjs"]
