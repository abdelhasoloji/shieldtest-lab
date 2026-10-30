FROM node:26.12-alpine
WORKDIR /app
COPY lib ./lib
COPY scrubber/*.mjs ./scrubber/
# Normalize perms: COPY inherits the host file mode, which on a restrictive
# umask (0600) leaves the sources unreadable by the non-root runtime user.
RUN chmod -R a+rX /app
USER node
CMD ["node", "scrubber/server.mjs"]
