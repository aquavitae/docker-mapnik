FROM node:5.7

COPY app /app
WORKDIR /app

RUN npm install

EXPOSE 3000

CMD ["npm", "run", "serve"]
