"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const role_controller_1 = require("../role/role.controller");
const datasource_1 = require("../../infrastructure/datasource/");
const repositories_1 = require("../../infrastructure/repositories/");
const role_1 = require("../validators/role");
const TokenValidator_1 = require("../services/TokenValidator");
const router = (0, express_1.Router)();
const datasource = new datasource_1.RoleDataSourceImpl();
const Repository = new repositories_1.RoleRepositoryImpl(datasource);
const RoleControl = new role_controller_1.RoleController(Repository);
router.post('/', TokenValidator_1.ValidatorTo.ValidarToken, role_1.ValidatorCreateUser, RoleControl.createRole);
router.get("/search/", TokenValidator_1.ValidatorTo.ValidarToken, RoleControl.getRoleMultiple);
router.delete("/:id", TokenValidator_1.ValidatorTo.ValidarToken, RoleControl.deleteRole);
router.get("/permi/", TokenValidator_1.ValidatorTo.ValidarToken, RoleControl.getAllPermissions);
router.put("/", TokenValidator_1.ValidatorTo.ValidarToken, role_1.ValidatorEdit, RoleControl.UpdateRole);
module.exports = router;
