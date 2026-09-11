FROM node:22.20.0-alpine
WORKDIR /app
COPY lib ./lib
COPY generator/*.mjs ./generator/
COPY profiles.mjs ./
# Normalize perms: COPY inherits the host file mode, which on a restrictive
# umask (0600) leaves the sources unreadable by the non-root runtime user.
RUN chmod -R a+rX /app
USER node
CMD ["node", "generator/generate.mjs"]
