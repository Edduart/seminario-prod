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
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnrollmentDataSourceImpl = void 0;
const postgres_1 = require("../../data/postgres");
const domain_1 = require("../../domain");
const subjectEnrollmentFilter_1 = require("./utils/subjectEnrollmentFilter");
const getStageOfSeminarianFilter_1 = require("./utils/getStageOfSeminarianFilter");
const calculateScore_1 = require("./utils/calculateScore");
const calculateIfSeminarianApproveStage_1 = require("./utils/calculateIfSeminarianApproveStage");
const formatDate_1 = require("../../presentation/utils/formatDate");
class EnrollmentDataSourceImpl {
    ContarEnrolls() {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield postgres_1.prisma.enrollment.count({
                where: {
                    status: domain_1.EnrollmentStatus.CURSANDO,
                },
            });
            return result;
        });
    }
    getAcademicTermByEnrollment(dto) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(dto.seminarian_id);
            const seminarianAcademicTerm = yield postgres_1.prisma.seminarian.findMany({
                where: {
                    id: dto.seminarian_id,
                    enrollment: { some: { seminarian_id: dto.seminarian_id } },
                },
                select: { id: true, enrollment: { include: { academic_term: true } } },
            });
            console.log(seminarianAcademicTerm);
            const removeRepeated = seminarianAcademicTerm.map((seminarian) => {
                const seenIds = new Set();
                return {
                    seminarian: seminarian.id,
                    enrollment: seminarian.enrollment.filter((enrollment) => {
                        const id = enrollment.academic_term.id;
                        if (!seenIds.has(id)) {
                            seenIds.add(id);
                            return true;
                        }
                        return false;
                    }),
                };
            });
            console.log(removeRepeated);
            const academicTermMap = removeRepeated.flatMap((seminarian) => ({
                seminarian_id: seminarian.seminarian,
                academic_term: seminarian.enrollment.map((enrollment) => ({
                    academic_term_id: enrollment.academic_term.id,
                    academic_term_semester: enrollment.academic_term.semester,
                    academic_term_start_date: (0, formatDate_1.formatDate)(enrollment.academic_term.start_date.toISOString()),
                    academic_term_end_date: (0, formatDate_1.formatDate)(enrollment.academic_term.end_date.toISOString()),
                    academic_term_status: enrollment.academic_term.status,
                })),
            }));
            console.log(academicTermMap);
            return academicTermMap;
        });
    }
    getSubjectsToEnroll(dto) {
        return __awaiter(this, void 0, void 0, function* () {
            const checkSeminarian = yield postgres_1.prisma.seminarian.findUnique({
                where: { id: dto.seminarian_id },
            });
            if (!checkSeminarian)
                throw `seminarian ID: ${dto.seminarian_id} does'nt exist`;
            const academicStatus = yield postgres_1.prisma.enrollment.findMany({
                where: {
                    seminarian_id: dto.seminarian_id,
                    NOT: {
                        OR: [{ status: "REPROBADO" }, { status: "RETIRADO" }],
                    },
                },
                include: { subject: { include: { course: true } } },
            });
            console.log("after prisma consult: ", academicStatus);
            const subjectsToEnroll = yield subjectEnrollmentFilter_1.EnrollmentSubjectFilter.subjectFilterForEquivalency(academicStatus, dto.seminarian_id);
            return subjectsToEnroll;
        });
    }
    createByEquivalence(dto) {
        return __awaiter(this, void 0, void 0, function* () {
            const equivalenceTransactionResult = postgres_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const checkSeminarian = yield tx.seminarian.findUnique({
                    where: { id: dto.seminarian_id },
                });
                const checkIfAlreadyEnroll = yield postgres_1.prisma.enrollment.findMany({
                    where: {
                        AND: [
                            { seminarian_id: dto.seminarian_id },
                            { subject_id: dto.subject_id },
                            { OR: [{ status: "APROBADO" }, { status: "CURSANDO" }] },
                        ],
                    },
                });
                if (checkIfAlreadyEnroll.length > 0)
                    throw `seminarian id ${dto.seminarian_id} is already enrolled in the subject or was already approved`;
                if (!checkSeminarian)
                    throw `seminarian id ${dto.seminarian_id} does't exist`;
                const equivalenceAcademicTerm = yield tx.academic_term.findFirst({
                    where: { status: "EQUIVALENCIAS" },
                });
                if (!equivalenceAcademicTerm)
                    throw "there is a error with the academic term EQUIVALENCIAS";
                const enroll = yield tx.enrollment.create({
                    data: {
                        seminarian_id: dto.seminarian_id,
                        subject_id: dto.subject_id,
                        academic_term_id: equivalenceAcademicTerm.id,
                        status: "APROBADO",
                    },
                });
                const equivalenceTest = yield tx.test.findFirst({
                    where: { subject_id: dto.subject_id },
                });
                if (!equivalenceTest)
                    throw `there is a error with the equivalence test ${dto.subject_id}, it is no found!`;
                const testScore = yield tx.test_score.create({
                    data: {
                        test_id: equivalenceTest.id,
                        enrollment_id: enroll.enrollment_id,
                        score: dto.subject_score,
                    },
                });
                console.log("all okay in equivalency transaction");
                return { equivalenceAcademicTerm, enroll, testScore };
            }));
            return equivalenceTransactionResult;
        });
    }
    updateStageIfApproved() {
        return __awaiter(this, void 0, void 0, function* () {
            const allEnrollmentBySeminarian = yield postgres_1.prisma.seminarian.findMany({
                where: {
                    AND: [
                        { status: "ACTIVO" },
                        { enrollment: { some: { status: "APROBADO" } } },
                    ],
                },
                select: {
                    id: true,
                    stage: true,
                    enrollment: { where: { status: "APROBADO" } },
                },
            });
            console.log(JSON.stringify(allEnrollmentBySeminarian));
            console.log({ allEnrollmentBySeminarian });
            return yield calculateIfSeminarianApproveStage_1.calculateStageStatus.calculateIfSeminarianApproveStage(allEnrollmentBySeminarian);
        });
    }
    updateStatusByFinalSubjectScore() {
        return __awaiter(this, void 0, void 0, function* () {
            const testScoreBySubject = yield postgres_1.prisma.enrollment.findMany({
                where: {
                    AND: [{ academic_term: { status: "ACTIVO" } }, { status: "CURSANDO" }],
                },
                include: {
                    subject: { select: { description: true } },
                    seminarian: {
                        select: {
                            user: {
                                select: {
                                    person: { select: { surname: true, forename: true } },
                                },
                            },
                        },
                    },
                    test_score: { include: { test: true } },
                    academic_term: {
                        select: { start_date: true, end_date: true, status: true },
                    },
                },
            });
            return yield calculateScore_1.calculateTestScore.calculateFinalSubjectScore(testScoreBySubject);
        });
    }
    getStageOfSeminarian(dto) {
        return __awaiter(this, void 0, void 0, function* () {
            const queryStage = domain_1.stages[dto.stage];
            const seminarians = yield postgres_1.prisma.seminarian.findMany({
                where: { AND: [{ status: "ACTIVO" }, { stage: queryStage }] },
                select: {
                    id: true,
                    stage: true,
                    user: {
                        select: { person: { select: { forename: true, surname: true } } },
                    },
                },
            });
            return getStageOfSeminarianFilter_1.GetStageOfSeminarianMap.mapResult(seminarians);
        });
    }
    getAcademicStatus(getDto) {
        return __awaiter(this, void 0, void 0, function* () {
            const checkSeminarian = yield postgres_1.prisma.seminarian.findUnique({
                where: { id: getDto.seminarian_id },
            });
            if (!checkSeminarian)
                throw `seminarian ID: ${getDto.seminarian_id} does'nt exist`;
            const academicStatus = yield postgres_1.prisma.enrollment.findMany({
                where: {
                    OR: [
                        {
                            seminarian_id: getDto.seminarian_id,
                            academic_term: { status: { not: "ACTIVO" } },
                            NOT: {
                                OR: [{ status: "REPROBADO" }, { status: "RETIRADO" }],
                            },
                        },
                        {
                            seminarian_id: getDto.seminarian_id,
                            academic_term: { status: "ACTIVO" },
                            NOT: {
                                OR: [{ status: "REPROBADO" }],
                            },
                        },
                    ],
                },
                include: { subject: { include: { course: true } } },
            });
            console.log("after prisma consult: ", academicStatus);
            const subjectsToEnroll = yield subjectEnrollmentFilter_1.EnrollmentSubjectFilter.subjectFilter(academicStatus, getDto.seminarian_id);
            return subjectsToEnroll;
        });
    }
    create(createDto) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.validateExistence(createDto);
            const createEnrollment = yield postgres_1.prisma.enrollment.createMany({
                data: createDto.subject_id.map((subjectId) => ({
                    seminarian_id: createDto.seminarian_id,
                    subject_id: subjectId,
                    academic_term_id: createDto.academic_term_id,
                })),
            });
            console.log("🚀 ~ EnrollmentDataSourceImpl ~ create ~ createEnrollment:", createEnrollment);
            return createEnrollment;
        });
    }
    get(getDto) {
        return __awaiter(this, void 0, void 0, function* () {
            const enrollment = yield postgres_1.prisma.enrollment.findMany({
                where: {
                    seminarian_id: getDto.seminarian_id,
                    academic_term_id: getDto.academic_term_id,
                    status: getDto.status,
                    subject_id: getDto.subject_id,
                    enrollment_id: getDto.enrollment_id,
                },
                include: {
                    subject: { select: { id: true, description: true } },
                    academic_term: {
                        select: { id: true, start_date: true, end_date: true, status: true },
                    },
                },
            });
            const enrollmentResponse = yield domain_1.GetEnrollmentDto.getResponse(enrollment);
            console.log({ enrollmentResponse });
            return enrollmentResponse;
        });
    }
    update(updateDto) {
        return __awaiter(this, void 0, void 0, function* () {
            const updateEnrollment = yield postgres_1.prisma.enrollment.update({
                where: {
                    enrollment_id: updateDto.enrollment_id,
                },
                data: {
                    status: updateDto.status,
                },
            });
            return domain_1.EnrollmentEntity.fromObject(updateEnrollment);
        });
    }
    delete(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const deleteEnrollment = yield postgres_1.prisma.enrollment.update({
                where: {
                    enrollment_id: id,
                },
                data: { status: "RETIRADO" },
            });
            return domain_1.EnrollmentEntity.fromObject(deleteEnrollment);
        });
    }
    validateExistence(dto, skip) {
        return __awaiter(this, void 0, void 0, function* () {
            const [enrollment, seminarian, subject, academicTerm] = yield Promise.all([
                yield postgres_1.prisma.enrollment.findMany({
                    where: {
                        seminarian_id: dto.seminarian_id,
                        subject_id: {
                            in: dto.subject_id,
                        },
                        academic_term_id: dto.academic_term_id,
                        status: dto === null || dto === void 0 ? void 0 : dto.status,
                    },
                }),
                postgres_1.prisma.seminarian.findUnique({ where: { id: dto.seminarian_id } }),
                postgres_1.prisma.subject.findMany({
                    where: { id: { in: dto.subject_id }, status: true },
                }),
                postgres_1.prisma.academic_term.findUnique({
                    where: { id: dto.academic_term_id },
                }),
            ]);
            if (skip == undefined && enrollment.length > 0)
                throw `Enrollment with the seminarian ID: ${dto.seminarian_id} , subject ID: ${dto.subject_id} , academic term ID: ${dto.academic_term_id}, already exist`;
            if (skip == true && enrollment.length == 0)
                throw `Enrollment with the seminarian ID: ${dto.seminarian_id} , subject ID: ${dto.subject_id} , academic term ID: ${dto.academic_term_id}, doesn't exist`;
            if (!seminarian)
                throw `Seminarian ID ${dto.seminarian_id} doesn't exist!`;
            if (subject.length == 0)
                throw `Subject ID ${dto.subject_id} doesn't exist!`;
            if (!academicTerm)
                throw `Academic term ID ${dto.academic_term_id} doesn't exist!`;
        });
    }
}
exports.EnrollmentDataSourceImpl = EnrollmentDataSourceImpl;
[];
