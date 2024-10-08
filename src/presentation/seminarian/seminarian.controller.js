"use strict";
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
exports.SeminarianControler = void 0;
const domain_1 = require("../../domain");
const fs_1 = __importDefault(require("fs"));
const parseData_1 = require("../utils/parseData");
const permissionValidator_1 = require("../services/permissionValidator");
const carta_culminacion_1 = require("../docs/carta_culminacion");
const ficha_1 = require("../docs/ficha");
const constance_1 = require("../docs/constance");
const seminarianlist_1 = require("../docs/seminarianlist");
const imageManipulation_1 = require("../../presentation/utils/imageManipulation");
class SeminarianControler {
    constructor(repository) {
        this.repository = repository;
        this.ficha = (req, res) => {
            new domain_1.SeminarianFichaUseCase(this.repository)
                .execute(req.params.id)
                .then((seminarians) => {
                try {
                    const line = res.writeHead(200, {
                        "Content-Type": "application/pdf",
                        "Content-Disposition": "inline; filename=ficha.pdf",
                    });
                    (0, ficha_1.BuildFicha)((data) => line.write(data), () => line.end(), seminarians);
                }
                catch (errorID) {
                    res.status(418).json("unable to create ID: " + errorID);
                }
            })
                .catch((error) => {
                res.status(418).json("unable to create ID: " + error);
            });
        };
        this.getCartaCulminacione = (req, res) => __awaiter(this, void 0, void 0, function* () {
            new domain_1.GetByIDCulminadoSeminarianUseCase(this.repository).execute(req.params.id)
                .then((data) => {
                const line = res.writeHead(200, {
                    "Content-Type": "application/pdf",
                    "Content-Disposition": "inline; filename=CartaCulminacion.pdf",
                });
                (0, carta_culminacion_1.BuildPDF)((data) => line.write(data), () => line.end(), data.id, data.surname, data.forename, req.query.nombre, req.query.cedula);
            })
                .catch((error) => {
                res
                    .status(400)
                    .json({ error: "error encontrando el seminarista" + error })
                    .send();
            });
        });
        this.GetConstance = (req, res) => __awaiter(this, void 0, void 0, function* () {
            new domain_1.GetByIDSeminarianUseCase(this.repository)
                .execute(req.params.id)
                .then((result) => {
                const line = res.writeHead(200, {
                    "Content-Type": "application/pdf",
                    "Content-Disposition": "inline; filename=constance.pdf",
                });
                (0, constance_1.BuildConstance)((data) => line.write(data), () => line.end(), result.id, result.surname, result.forename, result.period, result.stage, req.query.nombre, req.query.cedula);
            })
                .catch((error) => {
                console.log("error creado la carta" + error);
                res.status(404).json({ error: "Seminarian might not exists" }).send();
            });
        });
        this.get = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const result = (0, permissionValidator_1.ValidatePermission)(req.body.Permisos, "SEMINARIAN", "R");
                const [error, get_dto] = domain_1.GetSeminarianDTO.CreateDTO(req.query);
                if (error != undefined) {
                    console.log("verification errors:" + error);
                    res.json({ error }).send();
                }
                else {
                    if (get_dto != undefined) {
                        new domain_1.GetSeminarianUseCase(this.repository)
                            .execute(get_dto)
                            .then((seminarians) => {
                            res.json(seminarians).send;
                        })
                            .catch((error) => {
                            res.status(418).send("unable to get seminarians: " + error);
                        });
                    }
                }
            }
            catch (error) {
                res.status(418).json({ error });
            }
        });
        this.delete = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const result = (0, permissionValidator_1.ValidatePermission)(req.body.Permisos, "SEMINARIAN", "D");
                new domain_1.DeleteSeminarianUseCase(this.repository)
                    .execute(req.params.id)
                    .then((result) => {
                    if (typeof result !== "string") {
                        if (req.body.ayuda != null) {
                            fs_1.default.unlinkSync(req.body.ayuda);
                        }
                    }
                    res.json({ message: "seminarian deleted" }).send;
                })
                    .catch((error) => {
                    console.log("unexpected error while executing" + error);
                    res.status(400).send("Error deleting seminarian: " + error);
                });
            }
            catch (error) {
                console.log("unexpected error while executing");
                res.status(418).send("Error: " + error);
            }
        });
        this.update = (req, res) => __awaiter(this, void 0, void 0, function* () {
            const source = req.headers["Permissions"];
            try {
                const result = (0, permissionValidator_1.ValidatePermission)(source, "SEMINARIAN", "U");
                const data = req.body.data;
                const user_origin = yield JSON.parse(data);
                const persondto = yield (0, parseData_1.parsePersonData)(data, req.body.ayuda);
                let foreingdata = undefined;
                if (user_origin.ForeingSeminarian != undefined) {
                    foreingdata = new domain_1.CreateForeingSeminarian(user_origin.ForeingSeminarian.seminary_name, user_origin.ForeingSeminarian.stage, user_origin.ForeingSeminarian.stage_year);
                }
                const seminarian = new domain_1.UpdateSeminarian(foreingdata, user_origin.location, user_origin.apostleships, persondto, user_origin.ministery, user_origin.status, user_origin.stage);
                const errores = seminarian.Validate();
                if (errores == null) {
                    new domain_1.UpdateSeminarianUseCase(this.repository)
                        .execute(seminarian)
                        .then(() => __awaiter(this, void 0, void 0, function* () {
                        yield (0, imageManipulation_1.imageResize)(req.body.ayuda);
                        res.json({ message: "ready" });
                    }))
                        .catch((error) => {
                        console.log("unexpected error while executing" + error);
                        res.status(400).send("Unexpected error: " + error);
                    });
                }
                else {
                    console.log(errores);
                    res.status(400).send("Validation error: " + errores);
                }
            }
            catch (error) {
                console.log("unexpected error while executing");
                res.status(418).send("Error: " + error);
            }
        });
        this.Create = (req, res) => __awaiter(this, void 0, void 0, function* () {
            const source = req.headers["Permissions"];
            try {
                const result = (0, permissionValidator_1.ValidatePermission)(source, "SEMINARIAN", "C");
                const data = req.body.data;
                const user_origin = yield JSON.parse(data);
                const persondto = yield (0, parseData_1.parsePersonData)(data, req.body.ayuda);
                let foreingdata = undefined;
                if (user_origin.ForeingSeminarian != undefined) {
                    foreingdata = new domain_1.CreateForeingSeminarian(user_origin.ForeingSeminarian.seminary_name, user_origin.ForeingSeminarian.stage, user_origin.ForeingSeminarian.stage_year);
                }
                const user = yield (0, parseData_1.parseUserData)(req.body.data, persondto);
                user.role = 5;
                const seminarian = new domain_1.CreateSeminarian(foreingdata, user_origin.location, user_origin.stage, user_origin.apostleships, user, user_origin.ministery);
                const errores = seminarian.Validate();
                if (errores == null) {
                    new domain_1.CreateSeminarianUseCase(this.repository)
                        .execute(seminarian)
                        .then((seminarian) => __awaiter(this, void 0, void 0, function* () {
                        yield (0, imageManipulation_1.imageResize)(req.body.ayuda);
                        res.json({ message: "ready" }).send;
                    }))
                        .catch((error) => {
                        if (fs_1.default.existsSync(req.body.ayuda))
                            fs_1.default.unlinkSync(req.body.ayuda);
                        res.status(400).send("Unexpected " + error);
                    });
                }
                else {
                    if (fs_1.default.existsSync(req.body.ayuda))
                        fs_1.default.unlinkSync(req.body.ayuda);
                    console.log(errores);
                    res.status(400).send("Validation error: " + errores);
                }
            }
            catch (error) {
                if (fs_1.default.existsSync(req.body.ayuda))
                    fs_1.default.unlinkSync(req.body.ayuda);
                console.log("unexpected error while executing");
                console.log("error mientrs se ejecuta");
                res.status(418).send("Error: " + error);
            }
        });
        this.CreateList = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const result = (0, permissionValidator_1.ValidatePermission)(req.body.Permisos, "SEMINARIAN", "R");
                const [error, get_dto] = domain_1.GetSeminarianDTO.CreateDTO(req.query);
                if (error != undefined) {
                    console.log("verification errors:" + error);
                    res.json({ error }).send();
                }
                else {
                    if (get_dto != undefined) {
                        new domain_1.GetSeminarianUseCase(this.repository)
                            .execute(get_dto)
                            .then((seminarians) => {
                            const line = res.writeHead(200, {
                                "Content-Type": "application/pdf",
                                "Content-Disposition": "inline; filename=constance.pdf",
                            });
                            (0, seminarianlist_1.CreateSeminarianList)((data) => line.write(data), () => line.end(), seminarians);
                        })
                            .catch((error) => {
                            res.status(418).send("unable to get seminarians: " + error);
                        });
                    }
                }
            }
            catch (error) {
                res.status(418).json({ error });
            }
        });
    }
}
exports.SeminarianControler = SeminarianControler;
