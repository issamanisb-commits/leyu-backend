# ---------- Stage 1: Build ----------
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# native build tools
RUN apk add --no-cache python3 make g++

COPY package*.json ./

RUN npm install --legacy-peer-deps

COPY . .

RUN npm run build


# ---------- Stage 2: Production ----------
FROM node:22-alpine AS production

WORKDIR /usr/src/app

# native deps may still need these
# RUN apk add --no-cache python3 make g++

COPY package*.json ./

RUN npm install --production --legacy-peer-deps

COPY --from=builder /usr/src/app/dist ./dist

RUN mkdir -p ./uploads

EXPOSE 3001
# CMD ["npm", "run", "migration:run"]
CMD ["sh", "-c", "npm run migration:run:prod && node dist/main.js"]