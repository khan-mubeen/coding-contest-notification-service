FROM node:22.21.1-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 4001

CMD ["npm", "start"]
