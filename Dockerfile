FROM node:16.20.0-alpine

WORKDIR /app

COPY . ./

RUN apk --no-cache --update --virtual build-dependencies add python3 make g++ git
RUN yarn install

RUN yarn build

EXPOSE 3000

CMD ["yarn", "start-dev-frontend"]