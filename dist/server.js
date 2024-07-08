"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const node_telegram_bot_api_1 = __importDefault(require("node-telegram-bot-api"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mongoose_1 = __importStar(require("mongoose"));
const LessonSchema = new mongoose_1.Schema({
    playlist: { type: String, required: true },
    lessonNumber: { type: Number, required: true },
    videoUrl: { type: String, required: true },
    description: { type: String, required: true },
});
const Lesson = mongoose_1.default.model("Lesson", LessonSchema);
const UserSchema = new mongoose_1.Schema({
    chatId: { type: Number, required: true, unique: true },
    authenticated: { type: Boolean, required: true, default: false },
    isAdmin: { type: Boolean, required: true, default: false },
});
const User = mongoose_1.default.model("User", UserSchema);
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
const TOKEN = "7201731124:AAGkzKWQhuiKKMuG-W8U7p9jwNkUamakGKo";
const bot = new node_telegram_bot_api_1.default(TOKEN, { polling: true });
app.use(body_parser_1.default.json());
mongoose_1.default.set('strictQuery', true);
mongoose_1.default
    .connect("mongodb+srv://osman:kina@cluster0.8j2ykko.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0")
    .then(() => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Connected to MongoDB");
    const exampleLessons = [
        {
            playlist: "1",
            lessonNumber: 1,
            videoUrl: "http://example.com/lesson1",
            description: "Description for lesson 1",
        },
        {
            playlist: "1",
            lessonNumber: 2,
            videoUrl: "http://example.com/lesson2",
            description: "Description for lesson 2",
        },
        {
            playlist: "2",
            lessonNumber: 1,
            videoUrl: "http://example.com/lesson3",
            description: "Description for lesson 3",
        },
        {
            playlist: "2",
            lessonNumber: 2,
            videoUrl: "http://example.com/lesson4",
            description: "Description for lesson 4",
        },
        {
            playlist: "3",
            lessonNumber: 1,
            videoUrl: "http://example.com/lesson5",
            description: "Description for lesson 5",
        },
        {
            playlist: "3",
            lessonNumber: 2,
            videoUrl: "http://example.com/lesson6",
            description: "Description for lesson 6",
        },
    ];
    yield Lesson.insertMany(exampleLessons);
    function checkPassword(password) {
        const filePath = path_1.default.join(__dirname, "../passwords.txt");
        const passwords = fs_1.default.readFileSync(filePath, "utf-8").split("\n").map(p => p.trim());
        return passwords.includes(password.trim());
    }
    function checkAdminPassword(password) {
        const filePath = path_1.default.join(__dirname, "../admin_passwords.txt");
        const passwords = fs_1.default.readFileSync(filePath, "utf-8").split("\n").map(p => p.trim());
        return passwords.includes(password.trim());
    }
    bot.onText(/\/start/, (msg) => __awaiter(void 0, void 0, void 0, function* () {
        const chatId = msg.chat.id;
        const user = yield User.findOne({ chatId });
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
                        [{ text: "Logout" }]
                    ],
                    one_time_keyboard: true,
                    resize_keyboard: true,
                },
            });
        }
        else {
            bot.sendMessage(chatId, "Добро пожаловать! Пожалуйста, нажмите кнопку Login для входа.", {
                reply_markup: {
                    keyboard: [[{ text: "Login" }]],
                    one_time_keyboard: true,
                    resize_keyboard: true,
                },
            });
        }
    }));
    bot.on("message", (msg) => __awaiter(void 0, void 0, void 0, function* () {
        const chatId = msg.chat.id;
        const text = msg.text;
        const user = yield User.findOne({ chatId });
        if (user && user.authenticated) {
            if (text === "Logout") {
                yield User.findOneAndUpdate({ chatId }, { authenticated: false, isAdmin: false });
                bot.sendMessage(chatId, "Вы успешно вышли из системы.", {
                    reply_markup: {
                        keyboard: [[{ text: "Login" }]],
                        one_time_keyboard: true,
                        resize_keyboard: true,
                    },
                });
            }
            else if (user.isAdmin) {
                if (text === "Управление паролями 🛠") {
                    bot.sendMessage(chatId, "Выберите действие:", {
                        reply_markup: {
                            keyboard: [
                                [{ text: "Показать все пароли" }],
                                [{ text: "Добавить пароль" }],
                                [{ text: "Удалить пароль" }],
                                [{ text: "Назад" }]
                            ],
                            one_time_keyboard: true,
                            resize_keyboard: true,
                        },
                    });
                }
                else if (text === "Показать все пароли") {
                    const filePath = path_1.default.join(__dirname, "../passwords.txt");
                    const passwords = fs_1.default.readFileSync(filePath, "utf-8");
                    bot.sendMessage(chatId, `Пароли пользователей:\n${passwords}`);
                }
                else if (text === "Добавить пароль") {
                    bot.sendMessage(chatId, "Введите новый пароль:");
                    bot.once("message", (msg) => {
                        var _a;
                        const newPass = (_a = msg.text) === null || _a === void 0 ? void 0 : _a.trim();
                        if (newPass) {
                            fs_1.default.appendFileSync(path_1.default.join(__dirname, "../passwords.txt"), `\n${newPass}`);
                            bot.sendMessage(chatId, "Пароль добавлен.");
                        }
                    });
                }
                else if (text === "Удалить пароль") {
                    bot.sendMessage(chatId, "Введите пароль для удаления:");
                    bot.once("message", (msg) => {
                        var _a;
                        const delPass = (_a = msg.text) === null || _a === void 0 ? void 0 : _a.trim();
                        if (delPass) {
                            const filePath = path_1.default.join(__dirname, "../passwords.txt");
                            const passwords = fs_1.default.readFileSync(filePath, "utf-8").split("\n").map(p => p.trim());
                            const updatedPasswords = passwords.filter(p => p !== delPass);
                            fs_1.default.writeFileSync(filePath, updatedPasswords.join("\n"));
                            bot.sendMessage(chatId, "Пароль удален.");
                        }
                    });
                }
                else if (text === "Назад") {
                    bot.sendMessage(chatId, "Выберите раздел.", {
                        reply_markup: {
                            keyboard: [
                                [{ text: "Видео Курсы 🎉" }],
                                [{ text: "Гайды 🥋" }],
                                [{ text: "Отзывы 💬" }],
                                [{ text: "Помощь 🚨" }],
                                [{ text: "Как работать с ботом ❓" }],
                                [{ text: "Управление паролями 🛠" }],
                                [{ text: "Logout" }]
                            ],
                            one_time_keyboard: true,
                            resize_keyboard: true,
                        },
                    });
                }
            }
            else {
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
                }
                else if (text === "Гайд по набору мышечной массы" ||
                    text === "Гайд по снижению веса" ||
                    text === "Гайд по подготовке к турниру") {
                    let filePath = "";
                    if (text === "Гайд по набору мышечной массы") {
                        filePath = path_1.default.join(__dirname, "assets", "Гайд по набору мышечной массы.pdf");
                    }
                    else if (text === "Гайд по снижению веса") {
                        filePath = path_1.default.join(__dirname, "assets", "ГАЙД ПО СНИЖЕНИЮ ВЕСА.pdf");
                    }
                    else if (text === "Гайд по подготовке к турниру") {
                        filePath = path_1.default.join(__dirname, "assets", "Гайд по подготовке к турниру.pdf");
                    }
                    bot.sendChatAction(chatId, "upload_document");
                    bot.sendDocument(chatId, filePath).then(() => {
                        bot.sendMessage(chatId, "Гайд отправлен!");
                    }).catch(error => {
                        bot.sendMessage(chatId, "Произошла ошибка при отправке гайда. Пожалуйста, попробуйте снова.");
                        console.error(error);
                    });
                }
            }
        }
        else if (text === "Login") {
            bot.sendMessage(chatId, "Пожалуйста, введите ваш пароль.");
        }
        else if (text && checkPassword(text)) {
            yield User.findOneAndUpdate({ chatId }, { authenticated: true, isAdmin: false }, { upsert: true, new: true });
            bot.sendMessage(chatId, "Пароль верный! Выберите раздел.", {
                reply_markup: {
                    keyboard: [
                        [{ text: "Видео Курсы 🎉" }],
                        [{ text: "Гайды 🥋" }],
                        [{ text: "Отзывы 💬" }],
                        [{ text: "Помощь 🚨" }],
                        [{ text: "Как работать с ботом ❓" }],
                        [{ text: "Logout" }]
                    ],
                    one_time_keyboard: true,
                    resize_keyboard: true,
                },
            });
        }
        else if (text && checkAdminPassword(text)) {
            yield User.findOneAndUpdate({ chatId }, { authenticated: true, isAdmin: true }, { upsert: true, new: true });
            bot.sendMessage(chatId, "Вы вошли как администратор! Выберите раздел.", {
                reply_markup: {
                    keyboard: [
                        [{ text: "Видео Курсы 🎉" }],
                        [{ text: "Гайды 🥋" }],
                        [{ text: "Отзывы 💬" }],
                        [{ text: "Помощь 🚨" }],
                        [{ text: "Как работать с ботом ❓" }],
                        [{ text: "Управление паролями 🛠" }],
                        [{ text: "Logout" }]
                    ],
                    one_time_keyboard: true,
                    resize_keyboard: true,
                },
            });
        }
        else if (text) {
            bot.sendMessage(chatId, "Пароль неверный, попробуйте снова.");
        }
    }));
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}))
    .catch((error) => console.log(error));
