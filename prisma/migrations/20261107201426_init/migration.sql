-- CreateTable
CREATE TABLE "Centre" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "centreId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    CONSTRAINT "Batch_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "Centre" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "consentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "leftOn" DATETIME,
    CONSTRAINT "Student_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Student_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeePlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "gstRateBps" INTEGER NOT NULL DEFAULT 1800,
    CONSTRAINT "FeePlan_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Instalment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "feePlanId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'due',
    CONSTRAINT "Instalment_feePlanId_fkey" FOREIGN KEY ("feePlanId") REFERENCES "FeePlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Discount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instalmentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    CONSTRAINT "Discount_instalmentId_fkey" FOREIGN KEY ("instalmentId") REFERENCES "Instalment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instalmentId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "paidAt" DATETIME NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_instalmentId_fkey" FOREIGN KEY ("instalmentId") REFERENCES "Instalment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UnmatchedPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "receivedAt" DATETIME NOT NULL,
    "payerNote" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "allocatedInstalmentId" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" DATETIME,
    "resolutionNote" TEXT
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instalmentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "scheduledFor" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "sentAt" DATETIME,
    "cancelledAt" DATETIME,
    "cancelReason" TEXT,
    CONSTRAINT "Reminder_instalmentId_fkey" FOREIGN KEY ("instalmentId") REFERENCES "Instalment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reminderId" TEXT,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'sms',
    "language" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "MessageLog_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "Reminder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MessageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RefundPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "payoutDays" INTEGER NOT NULL DEFAULT 10,
    "publishedAt" DATETIME NOT NULL,
    "notes" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "RefundTier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "policyId" TEXT NOT NULL,
    "upToWeek" INTEGER NOT NULL,
    "refundPercent" INTEGER NOT NULL,
    CONSTRAINT "RefundTier_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "RefundPolicy" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AttendanceWeek" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "weekStart" DATETIME NOT NULL,
    "percent" INTEGER NOT NULL,
    CONSTRAINT "AttendanceWeek_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "testDate" DATETIME NOT NULL,
    "percent" INTEGER NOT NULL,
    CONSTRAINT "TestScore_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DropoutFlag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "signals" TEXT NOT NULL,
    "explanation" TEXT,
    "explanationSource" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "reviewNote" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "DropoutFlag_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CounsellorTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flagId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'call_parent',
    "status" TEXT NOT NULL DEFAULT 'open',
    "dueBy" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "CounsellorTask_flagId_fkey" FOREIGN KEY ("flagId") REFERENCES "DropoutFlag" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CounsellorTask_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Centre_name_key" ON "Centre"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_centreId_name_key" ON "Batch"("centreId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "OtpChallenge_phone_idx" ON "OtpChallenge"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Student_code_key" ON "Student"("code");

-- CreateIndex
CREATE UNIQUE INDEX "FeePlan_studentId_key" ON "FeePlan"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Instalment_code_key" ON "Instalment"("code");

-- CreateIndex
CREATE INDEX "Instalment_status_dueDate_idx" ON "Instalment"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Instalment_feePlanId_seq_key" ON "Instalment"("feePlanId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_receiptNo_key" ON "Payment"("receiptNo");

-- CreateIndex
CREATE UNIQUE INDEX "UnmatchedPayment_reference_key" ON "UnmatchedPayment"("reference");

-- CreateIndex
CREATE INDEX "Reminder_status_scheduledFor_idx" ON "Reminder"("status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_instalmentId_offsetDays_key" ON "Reminder"("instalmentId", "offsetDays");

-- CreateIndex
CREATE UNIQUE INDEX "RefundPolicy_version_key" ON "RefundPolicy"("version");

-- CreateIndex
CREATE UNIQUE INDEX "RefundTier_policyId_upToWeek_key" ON "RefundTier"("policyId", "upToWeek");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceWeek_studentId_weekStart_key" ON "AttendanceWeek"("studentId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "TestScore_studentId_testName_key" ON "TestScore"("studentId", "testName");

-- CreateIndex
CREATE UNIQUE INDEX "CounsellorTask_flagId_key" ON "CounsellorTask"("flagId");
