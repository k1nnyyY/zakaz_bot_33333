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
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

interface ILesson extends Document {
  playlist: string;
  lessonNumber: number;
  videoUrl: string;
  description: string;
  imageUrl: string;
  hasSubLessons: boolean;
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
  imageUrl: { type: String, required: true },
  hasSubLessons: { type: Boolean, required: true },
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
  messageIds: number[];
}

const UserSchema: Schema = new Schema({
  chatId: { type: Number, required: true, unique: true },
  authenticated: { type: Boolean, required: true, default: false },
  isAdmin: { type: Boolean, required: true, default: false },
  messageIds: { type: [Number], default: [] },
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
  .connect(dbConnectionString, {})
  .then(async () => {
    console.log("Connected to MongoDB");

    const imagesPath = path.join(__dirname, "images");
    if (!fs.existsSync(imagesPath)) {
      fs.mkdirSync(imagesPath);
    }

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

    async function clearPreviousMessages(chatId: number) {
      const user = await User.findOne({ chatId });
      if (user && user.messageIds.length > 0) {
        user.messageIds.forEach(async (messageId) => {
          try {
            await bot.deleteMessage(chatId, messageId.toString());
          } catch (error) {
            console.error(`Failed to delete message ${messageId}:`, error);
          }
        });
        user.messageIds = [];
        await user.save();
      }
    }

    bot.onText(/\/start/, async (msg: Message) => {
      const chatId = msg.chat.id;

      const user = await User.findOne({ chatId });
      if (user && user.authenticated) {
        const message = user.isAdmin
          ? "Вы вошли как администратор! Выберите раздел."
          : "Вы уже вошли в систему! Выберите раздел.";

        const sentMessage = await bot.sendMessage(chatId, message, {
          reply_markup: {
            keyboard: [
              [{ text: "Видео Курсы 🎉" }],
              [{ text: "Гайды 🥋" }],
              [{ text: "Отзывы 💬" }],
              [{ text: "Помощь 🚨" }],
              [{ text: "Как работать с ботом ❓" }],
              [{ text: "Управление уроками 📚" }],
              ...(user.isAdmin ? [[{ text: "Управление паролями 🛠" }]] : []),
              [{ text: "Logout" }],
            ],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        });

        user.messageIds.push(sentMessage.message_id);
        await user.save();
      } else {
        const sentMessage = await bot.sendMessage(
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

        if (user) {
          user.messageIds.push(sentMessage.message_id);
          await user.save();
        }
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
          await clearPreviousMessages(chatId);
          const sentMessage = await bot.sendMessage(chatId, "Вы успешно вышли из системы.", {
            reply_markup: {
              keyboard: [[{ text: "Login" }]],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          });

          user.messageIds.push(sentMessage.message_id);
          await user.save();
        } else if (user.isAdmin) {
          if (text === "Управление уроками 📚") {
            await clearPreviousMessages(chatId);
            const sentMessage = await bot.sendMessage(chatId, "Выберите действие:", {
              reply_markup: {
                keyboard: [
                  [{ text: "Добавить урок" }],
                  [{ text: "Удалить урок" }],
                  [{ text: "Просмотреть уроки" }],
                  [{ text: "Назад" }],
                ],
                one_time_keyboard: true,
                resize_keyboard: true,
              },
            });

            user.messageIds.push(sentMessage.message_id);
            await user.save();
          } else if (text === "Добавить урок") {
            const sentMessage = await bot.sendMessage(chatId, "Пожалуйста, отправьте картинку для превью урока.");
            user.messageIds.push(sentMessage.message_id);
            await user.save();

            bot.once("photo", async (msg: Message) => {
              const fileId = msg.photo?.[msg.photo.length - 1].file_id;
              if (!fileId) return;

              const file = await bot.getFile(fileId);
              const filePath = file.file_path;
              if (!filePath) return;
              const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
              const localPath = path.join(imagesPath, path.basename(filePath));
              const fileStream = fs.createWriteStream(localPath);

              https.get(fileUrl, (response: any) => {
                response.pipe(fileStream);
                fileStream.on("finish", () => {
                  fileStream.close();

                  const sentMessage = bot.sendMessage(chatId, "Теперь введите данные урока в формате:\n1) Плейлист\n2) Номер урока\n3) URL видео\n4) Описание\n5) Есть подуроки (да/нет)", {
                    reply_markup: {
                      force_reply: true,
                    },
                  });

                  user.messageIds.push(sentMessage.message_id);
                  await user.save();

                  bot.onReplyToMessage(chatId, sentMessage.message_id, async (reply) => {
                    const lessonData = reply.text?.split("\n");
                    if (lessonData && lessonData.length >= 5) {
                      const newLesson = new Lesson({
                        playlist: lessonData[0].trim(),
                        lessonNumber: Number(lessonData[1].trim()),
                        videoUrl: lessonData[2].trim(),
                        description: lessonData[3].trim(),
                        imageUrl: localPath,
                        hasSubLessons: lessonData[4].trim().toLowerCase() === "да",
                      });
                      await newLesson.save();
                      bot.sendMessage(chatId, "Урок добавлен.");
                    } else {
                      bot.sendMessage(chatId, "Неверный формат данных. Попробуйте снова.");
                    }
                  });
                });
              });
            });
          } else if (text === "Удалить урок") {
            await clearPreviousMessages(chatId);
            const sentMessage = await bot.sendMessage(chatId, "Введите номер урока для удаления:", {
              reply_markup: {
                force_reply: true,
              },
            });

            user.messageIds.push(sentMessage.message_id);
            await user.save();

            bot.onReplyToMessage(chatId, sentMessage.message_id, async (reply) => {
              const lessonNumber = reply.text?.trim();
              if (lessonNumber) {
                await Lesson.deleteOne({ lessonNumber: Number(lessonNumber) });
                bot.sendMessage(chatId, "Урок удален.");
              } else {
                bot.sendMessage(chatId, "Неверный номер урока. Попробуйте снова.");
              }
            });
          } else if (text === "Просмотреть уроки") {
            await clearPreviousMessages(chatId);
            const lessons = await Lesson.find({}).sort({ lessonNumber: 1 });

            for (const lesson of lessons) {
              const inlineKeyboard = lesson.subLessons?.map((subLesson) => [
                {
                  text: subLesson.title,
                  callback_data: JSON.stringify({
                    lessonNumber: lesson.lessonNumber,
                    subLessonNumber: subLesson.lessonNumber,
                  }),
                },
              ]) || [];

              if (lesson.imageUrl) {
                const sentMessage = await bot.sendPhoto(chatId, lesson.imageUrl, {
                  caption: `Урок ${lesson.lessonNumber}: ${lesson.description}\n[Смотреть видео](${lesson.videoUrl})`,
                  parse_mode: "Markdown",
                  reply_markup: {
                    inline_keyboard: inlineKeyboard,
                  },
                });
                user.messageIds.push(sentMessage.message_id);
              } else {
                const sentMessage = await bot.sendMessage(chatId, `Урок ${lesson.lessonNumber}: ${lesson.description}\n[Смотреть видео](${lesson.videoUrl})`, {
                  parse_mode: "Markdown",
                  reply_markup: {
                    inline_keyboard: inlineKeyboard,
                  },
                });
                user.messageIds.push(sentMessage.message_id);
              }
            }
            await user.save();
          } else if (text === "Управление паролями 🛠") {
            await clearPreviousMessages(chatId);
            const sentMessage = await bot.sendMessage(chatId, "Выберите действие:", {
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

            user.messageIds.push(sentMessage.message_id);
            await user.save();
          } else if (text === "Показать все пароли") {
            const filePath = path.join(__dirname, "../passwords.txt");
            const passwords = fs.readFileSync(filePath, "utf-8");
            bot.sendMessage(chatId, `Пароли пользователей:\n${passwords}`);
          } else if (text === "Добавить пароль") {
            const sentMessage = await bot.sendMessage(chatId, "Введите новый пароль:");
            user.messageIds.push(sentMessage.message_id);
            await user.save();

            bot.once("message", async (msg: Message) => {
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
            const sentMessage = await bot.sendMessage(chatId, "Введите пароль для удаления:");
            user.messageIds.push(sentMessage.message_id);
            await user.save();

            bot.once("message", async (msg: Message) => {
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
            await clearPreviousMessages(chatId);
            const sentMessage = await bot.sendMessage(chatId, "Выберите раздел.", {
              reply_markup: {
                keyboard: [
                  [{ text: "Видео Курсы 🎉" }],
                  [{ text: "Гайды 🥋" }],
                  [{ text: "Отзывы 💬" }],
                  [{ text: "Помощь 🚨" }],
                  [{ text: "Как работать с ботом ❓" }],
                  [{ text: "Управление уроками 📚" }],
                  [{ text: "Управление паролями 🛠" }],
                  [{ text: "Logout" }],
                ],
                one_time_keyboard: true,
                resize_keyboard: true,
              },
            });

            user.messageIds.push(sentMessage.message_id);
            await user.save();
          }
        } else {
          if (text === "Видео Курсы 🎉") {
            await clearPreviousMessages(chatId);
            const lessons = await Lesson.find({}).sort({ lessonNumber: 1 });

            for (const lesson of lessons) {
              const inlineKeyboard = lesson.subLessons?.map((subLesson) => [
                {
                  text: subLesson.title,
                  callback_data: JSON.stringify({
                    lessonNumber: lesson.lessonNumber,
                    subLessonNumber: subLesson.lessonNumber,
                  }),
                },
              ]) || [];

              if (lesson.imageUrl) {
                const sentMessage = await bot.sendPhoto(chatId, lesson.imageUrl, {
                  caption: `Урок ${lesson.lessonNumber}: ${lesson.description}\n[Смотреть видео](${lesson.videoUrl})`,
                  parse_mode: "Markdown",
                  reply_markup: {
                    inline_keyboard: inlineKeyboard,
                  },
                });
                user.messageIds.push(sentMessage.message_id);
              } else {
                const sentMessage = await bot.sendMessage(chatId, `Урок ${lesson.lessonNumber}: ${lesson.description}\n[Смотреть видео](${lesson.videoUrl})`, {
                  parse_mode: "Markdown",
                  reply_markup: {
                    inline_keyboard: inlineKeyboard,
                  },
                });
                user.messageIds.push(sentMessage.message_id);
              }
            }
            await user.save();
          } else if (text === "Гайды 🥋") {
            const sentMessage = await bot.sendMessage(chatId, "Выберите один из следующих гайдов:", {
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

            user.messageIds.push(sentMessage.message_id);
            await user.save();
          } else if (
            text === "Гайд по набору мышечной массы" ||
            text === "Гайд по снижению веса" ||
            text === "Гайд по подготовке к турниру"
          ) {
            let filePath = "";
            if (text === "Гайд по набору мышечной массы") {
              filePath = path.join(
                __dirname,
                "assets",
                "Гайд_по_набору_мышечной_массы_compressed.pdf"
              );
            } else if (text === "Гайд по снижению веса") {
              filePath = path.join(
                __dirname,
                "assets",
                "Гайд_по_снижению_веса_compressed.pdf"
              );
            } else if (text === "Гайд по подготовке к турниру") {
              filePath = path.join(
                __dirname,
                "assets",
                "Гайд_по_подготовке_к_турниру_compressed.pdf"
              );
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
          } else if (text === "Плейлист 1") {
            const imgPath = path.join(__dirname, "assets", "img1.jpg");
            const sentMessage = await bot.sendPhoto(chatId, imgPath, {
              caption: "Это плейлист 1. Выберите урок:",
              reply_markup: {
                inline_keyboard: [
                  [{ text: "Урок 1", callback_data: "1" }],
                  [{ text: "Урок 2", callback_data: "2" }],
                ],
              },
            });

            user.messageIds.push(sentMessage.message_id);
            await user.save();
          } else if (text === "Плейлист 2") {
            const imgPath = path.join(__dirname, "assets", "img1.jpg");
            const sentMessage = await bot.sendPhoto(chatId, imgPath, {
              caption: "Это плейлист 2. Выберите урок:",
              reply_markup: {
                inline_keyboard: [
                  [{ text: "Урок 1", callback_data: "3" }],
                  [{ text: "Урок 2", callback_data: "4" }],
                ],
              },
            });

            user.messageIds.push(sentMessage.message_id);
            await user.save();
          }
        }
      } else if (text === "Login") {
        const sentMessage = await bot.sendMessage(chatId, "Пожалуйста, введите ваш пароль.");
        user.messageIds.push(sentMessage.message_id);
        await user.save();
      } else if (text && checkPassword(text)) {
        await User.findOneAndUpdate(
          { chatId },
          { authenticated: true, isAdmin: false },
          { upsert: true, new: true }
        );

        const sentMessage = await bot.sendMessage(chatId, "Пароль верный! Выберите раздел.", {
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

        user.messageIds.push(sentMessage.message_id);
        await user.save();
      } else if (text && checkAdminPassword(text)) {
        await User.findOneAndUpdate(
          { chatId },
          { authenticated: true, isAdmin: true },
          { upsert: true, new: true }
        );

        const sentMessage = await bot.sendMessage(
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
                [{ text: "Управление уроками 📚" }],
                [{ text: "Управление паролями 🛠" }],
                [{ text: "Logout" }],
              ],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          }
        );

        user.messageIds.push(sentMessage.message_id);
        await user.save();
      } else if (text) {
        const sentMessage = await bot.sendMessage(chatId, "Пароль неверный, попробуйте снова.");
        user.messageIds.push(sentMessage.message_id);
        await user.save();
      }
    });

    bot.on("callback_query", (callbackQuery) => {
      const { message, data } = callbackQuery;
      if (!message || !data) {
        return;
      }

      try {
        const { lessonNumber, subLessonNumber } = JSON.parse(data);
        Lesson.findOne({ lessonNumber }).then((lesson) => {
          if (lesson && lesson.subLessons) {
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
      } catch (error) {
        console.error("Error parsing callback data: ", error);
      }
    });

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => console.log(error));
