FROM node:18

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm install -g mongodb-tools
RUN npm install typescript --save-dev
RUN npm install dotenv mongoose @types/dotenv @types/mongoose --save-dev

RUN npx tsc

EXPOSE 3000

CMD ["npm", "start"]
