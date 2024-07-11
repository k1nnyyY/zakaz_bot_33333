import express from "express";
import bodyParser from "body-parser";
import TelegramBot, { Message } from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import mongoose, { Schema, Document } from "mongoose";
import dotenv from "dotenv";
import dbConnectionString from "./dbConfig.js";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

interface ILesson extends Document {
  playlist: string;
  lessonNumber: number;
  videoUrl: string;
  description: string;
  imageUrl?: string;
  subLessons?: Array<{
    lessonNumber: number;
    title: string;
    videoUrl: string;
  }>;
}

const LessonSchema: Schema = new Schema({
  playlist: { type: String, required: true },
  lessonNumber: { type: Number, required: true },
  videoUrl: { type: String, required: true },
  description: { type: String, required: true },
  imageUrl: { type: String, required: false },
  subLessons: [
    {
      lessonNumber: { type: Number, required: false },
      title: { type: String, required: false },
      videoUrl: { type: String, required: false },
    },
  ],
});

const Lesson = mongoose.model<ILesson>("Lesson", LessonSchema);

interface IUser extends Document {
  chatId: number;
  authenticated: boolean;
  isAdmin: boolean;
}

const UserSchema: Schema = new Schema({
  chatId: { type: Number, required: true, unique: true },
  authenticated: { type: Boolean, required: true, default: false },
  isAdmin: { type: Boolean, required: true, default: false },
});

const User = mongoose.model<IUser>("User", UserSchema);

const app = express();
const PORT = process.env.PORT || "3000";
const TOKEN = process.env.BOT_TOKEN || "YOUR_BOT_TOKEN";

console.log("Starting Telegram Bot...");
const bot = new TelegramBot(TOKEN, { polling: true });

app.use(bodyParser.json());

mongoose.set("strictQuery", true);

await mongoose
  .connect(dbConnectionString, {
  })
  .then(async () => {
    console.log("Connected to MongoDB");

    const exampleLessons = [
      {
        playlist: "1",
        lessonNumber: 1,
        videoUrl: "http://example.com/lesson1",
        description: "Description for lesson 1",
        imageUrl: "http://example.com/image1.jpg",
      },
      {
        playlist: "1",
        lessonNumber: 2,
        videoUrl: "http://example.com/lesson2",
        description: "Description for lesson 2",
        imageUrl: "http://example.com/image2.jpg",
        subLessons: [
          {
            lessonNumber: 2.1,
            title: "Sub Lesson 1",
            videoUrl: "http://example.com/sublesson1",
          },
          {
            lessonNumber: 2.2,
            title: "Sub Lesson 2",
            videoUrl: "http://example.com/sublesson2",
          },
        ],
      },
    ];

    await Lesson.insertMany(exampleLessons);

    function checkPassword(password: string): boolean {
      const filePath = path.join(__dirname, "../passwords.txt");
      const passwords = fs
        .readFileSync(filePath, "utf-8")
        .split("\n")
        .map((p) => p.trim());
      return passwords.includes(password.trim());
    }

    function checkAdminPassword(password: string): boolean {
      const filePath = path.join(__dirname, "../admin_passwords.txt");
      const passwords = fs
        .readFileSync(filePath, "utf-8")
        .split("\n")
        .map((p) => p.trim());
      return passwords.includes(password.trim());
    }

    bot.onText(/\/start/, async (msg: Message) => {
      const chatId = msg.chat.id;

      const user = await User.findOne({ chatId });
      if (user && user.authenticated) {
        const message = user.isAdmin
          ? "Вы вошли как администратор! Выберите раздел."
          : "Вы уже вошли в систему! Выберите раздел.";

        bot.sendMessage(chatId, message, {
          reply_markup: {
            keyboard: [
              [{ text: "Видео Курсы 🎉" }],
              [{ text: "Гайды 🥋" }],
              [{ text: "Отзывы 💬" }],
              [{ text: "Помощь 🚨" }],
              [{ text: "Как работать с ботом ❓" }],
              ...(user.isAdmin ? [[{ text: "Управление паролями 🛠" }]] : []),
              [{ text: "Logout" }],
            ],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        });
      } else {
        bot.sendMessage(
          chatId,
          "Добро пожаловать! Пожалуйста, нажмите кнопку Login для входа.",
          {
            reply_markup: {
              keyboard: [[{ text: "Login" }]],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          }
        );
      }
    });

    bot.on("message", async (msg: Message) => {
      const chatId = msg.chat.id;
      const text: string | undefined = msg.text;

      const user = await User.findOne({ chatId });

      if (user && user.authenticated) {
        if (text === "Logout") {
          await User.findOneAndUpdate(
            { chatId },
            { authenticated: false, isAdmin: false }
          );
          bot.sendMessage(chatId, "Вы успешно вышли из системы.", {
            reply_markup: {
              keyboard: [[{ text: "Login" }]],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          });
        } else if (user.isAdmin) {
          if (text === "Управление паролями 🛠") {
            bot.sendMessage(chatId, "Выберите действие:", {
              reply_markup: {
                keyboard: [
                  [{ text: "Показать все пароли" }],
                  [{ text: "Добавить пароль" }],
                  [{ text: "Удалить пароль" }],
                  [{ text: "Назад" }],
                ],
                one_time_keyboard: true,
                resize_keyboard: true,
              },
            });
          } else if (text === "Показать все пароли") {
            const filePath = path.join(__dirname, "../passwords.txt");
            const passwords = fs.readFileSync(filePath, "utf-8");
            bot.sendMessage(chatId, `Пароли пользователей:\n${passwords}`);
          } else if (text === "Добавить пароль") {
            bot.sendMessage(chatId, "Введите новый пароль:");
            bot.once("message", (msg: Message) => {
              const newPass = msg.text?.trim();
              if (newPass) {
                fs.appendFileSync(
                  path.join(__dirname, "../passwords.txt"),
                  `\n${newPass}`
                );
                bot.sendMessage(chatId, "Пароль добавлен.");
              }
            });
          } else if (text === "Удалить пароль") {
            bot.sendMessage(chatId, "Введите пароль для удаления:");
            bot.once("message", (msg: Message) => {
              const delPass = msg.text?.trim();
              if (delPass) {
                const filePath = path.join(__dirname, "../passwords.txt");
                const passwords = fs
                  .readFileSync(filePath, "utf-8")
                  .split("\n")
                  .map((p) => p.trim());
                const updatedPasswords = passwords.filter((p) => p !== delPass);
                fs.writeFileSync(filePath, updatedPasswords.join("\n"));
                bot.sendMessage(chatId, "Пароль удален.");
              }
            });
          } else if (text === "Назад") {
            bot.sendMessage(chatId, "Выберите раздел.", {
              reply_markup: {
                keyboard: [
                  [{ text: "Видео Курсы 🎉" }],
                  [{ text: "Гайды 🥋" }],
                  [{ text: "Отзывы 💬" }],
                  [{ text: "Помощь 🚨" }],
                  [{ text: "Как работать с ботом ❓" }],
                  [{ text: "Управление паролями 🛠" }],
                  [{ text: "Logout" }],
                ],
                one_time_keyboard: true,
                resize_keyboard: true,
              },
            });
          }
        } else {
          if (text === "Гайды 🥋") {
            bot.sendMessage(chatId, "Выберите один из следующих гайдов:", {
              reply_markup: {
                keyboard: [
                  [{ text: "Гайд по набору мышечной массы" }],
                  [{ text: "Гайд по снижению веса" }],
                  [{ text: "Гайд по подготовке к турниру" }],
                ],
                one_time_keyboard: true,
                resize_keyboard: true,
              },
            });
          } else if (
            text === "Гайд по набору мышечной массы" ||
            text === "Гайд по снижению веса" ||
            text === "Гайд по подготовке к турниру"
          ) {
            let filePath = "";
            if (text === "Гайд по набору мышечной массы") {
              filePath = path.join(__dirname, "assets", "Гайд_по_набору_мышечной_массы_compressed.pdf");
            } else if (text === "Гайд по снижению веса") {
              filePath = path.join(__dirname, "assets", "Гайд_по_снижению_веса_compressed.pdf");
            } else if (text === "Гайд по подготовке к турниру") {
              filePath = path.join(__dirname, "assets", "Гайд_по_подготовке_к_турниру_compressed.pdf");
            }

            bot.sendChatAction(chatId, "upload_document");

            bot
              .sendDocument(chatId, filePath)
              .then(() => {
                bot.sendMessage(chatId, "Гайд отправлен!");
              })
              .catch((error) => {
                bot.sendMessage(
                  chatId,
                  "Произошла ошибка при отправке гайда. Пожалуйста, попробуйте снова."
                );
                console.error(error);
              });
          }
        }
      } else if (text === "Login") {
        bot.sendMessage(chatId, "Пожалуйста, введите ваш пароль.");
      } else if (text && checkPassword(text)) {
        await User.findOneAndUpdate(
          { chatId },
          { authenticated: true, isAdmin: false },
          { upsert: true, new: true }
        );

        bot.sendMessage(chatId, "Пароль верный! Выберите раздел.", {
          reply_markup: {
            keyboard: [
              [{ text: "Видео Курсы 🎉" }],
              [{ text: "Гайды 🥋" }],
              [{ text: "Отзывы 💬" }],
              [{ text: "Помощь 🚨" }],
              [{ text: "Как работать с ботом ❓" }],
              [{ text: "Logout" }],
            ],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        });
      } else if (text && checkAdminPassword(text)) {
        await User.findOneAndUpdate(
          { chatId },
          { authenticated: true, isAdmin: true },
          { upsert: true, new: true }
        );

        bot.sendMessage(
          chatId,
          "Вы вошли как администратор! Выберите раздел.",
          {
            reply_markup: {
              keyboard: [
                [{ text: "Видео Курсы 🎉" }],
                [{ text: "Гайды 🥋" }],
                [{ text: "Отзывы 💬" }],
                [{ text: "Помощь 🚨" }],
                [{ text: "Как работать с ботом ❓" }],
                [{ text: "Управление паролями 🛠" }],
                [{ text: "Logout" }],
              ],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          }
        );
      } else if (text) {
        bot.sendMessage(chatId, "Пароль неверный, попробуйте снова.");
      }
    });

    bot.onText(/\/lessons/, async (msg: Message) => {
      const chatId = msg.chat.id;
      const lessons = await Lesson.find({}).sort({ lessonNumber: 1 });

      lessons.forEach((lesson) => {
        const inlineKeyboard = lesson.subLessons?.map((subLesson) => [
          {
            text: subLesson.title,
            callback_data: JSON.stringify({
              lessonNumber: lesson.lessonNumber,
              subLessonNumber: subLesson.lessonNumber,
            }),
          },
        ]) || [];

        bot.sendPhoto(chatId, lesson.imageUrl, {
          caption: `Урок ${lesson.lessonNumber}: ${lesson.description}\n[Смотреть видео](${lesson.videoUrl})`,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: inlineKeyboard,
          },
        });
      });
    });

    bot.on("callback_query", (callbackQuery) => {
      const { message, data } = callbackQuery;
      const { lessonNumber, subLessonNumber } = JSON.parse(data);

      Lesson.findOne({ lessonNumber }).then((lesson) => {
        if (lesson) {
          const subLesson = lesson.subLessons.find(
            (s) => s.lessonNumber === subLessonNumber
          );
          if (subLesson) {
            bot.sendMessage(
              message.chat.id,
              `Подурок ${subLesson.lessonNumber}: ${subLesson.title}\n[Смотреть видео](${subLesson.videoUrl})`,
              { parse_mode: "Markdown" }
            );
          }
        }
      });
    });

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => console.log(error));
