FROM node:20-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY . .

ENV PORT=3030
ENV DATA_DIR=/app/data

EXPOSE 3030

VOLUME ["/app/data"]

CMD ["node", "server.js"]
