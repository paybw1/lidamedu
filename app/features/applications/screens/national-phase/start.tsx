/**
 * National Phase Start Page
 *
 * 국제출원 국내단계 신청 시작 페이지입니다.
 */
import type { Route } from "../+types/start";

import { AlertCircleIcon, CheckIcon, Loader2, XIcon } from "lucide-react";
import { DateTime } from "luxon";
import React, {
  type ChangeEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Form,
  redirect,
  useFetcher,
  useNavigate,
  useRevalidator,
} from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { Combobox } from "~/core/components/combobox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/core/components/ui/accordion";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "~/core/components/ui/alert";
import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import { FileDropzone } from "~/core/components/ui/filedropzone";
import { FormErrorAlert } from "~/core/components/ui/form-error-alert";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectScrollDownButton,
  SelectTrigger,
  SelectValue,
} from "~/core/components/ui/select";
import { Separator } from "~/core/components/ui/separator";
import { getEpoToken } from "~/core/epo/getEpoToken.server";
import {
  type FamilyMember,
  findKoreanApplicationReference,
} from "~/core/epo/hasKR";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";

import {
  DialogSaveDraft,
  SaveDraftAlert,
} from "../provisional-application/start";

// ▸ Vite 환경변수
const EPO_CLIENT_ID = import.meta.env.VITE_EPO_CLIENT_ID!;
const EPO_CLIENT_SECRET = import.meta.env.VITE_EPO_CLIENT_SECRET!;

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    throw redirect("/login");
  } else {
    const access_token = await getEpoToken();
    /* 3) plain 객체 반환 ------------------------------------------------------ */
    return {
      // 로그인 사용자 정보 (UI 컴포넌트에서 useLoaderData로 바로 사용 가능)
      user,

      // EPO 토큰 정보
      epoAccessToken: access_token,
    };
  }
};

// export const action = async ({ request }: Route.LoaderArgs) => {
//   const [client] = makeServerClient(request);
//   const {
//     data: { user },
//   } = await client.auth.getUser();
//   /* ① 폼 데이터 추출 */
//   const formData = await request.formData();
//   console.log("🚀 [formData] formData", formData);
//   const selectedType = formData.get("selectedType"); // "applicationNumber" | "publicationNumber"
//   const pctApplicationNumber = formData.get("pctApplicationNumber"); // "WO2022/117218" 등

//   /* ② 타입 체크 */
//   if (
//     typeof selectedType !== "string" ||
//     typeof pctApplicationNumber !== "string"
//   ) {
//     throw new Error("required value is missing");
//   }

//   /* ③ 나머지 로직은 동일 */
//   const token = await getEpoToken();
//   const pathPart =
//     selectedType === "applicationNumber" ? "application" : "publication";
//   const docdb = convertToDocdb(pctApplicationNumber, selectedType);
//   console.log("🚀 [docdb] docdb", docdb);
//   const url = `https://ops.epo.org/3.2/rest-services/family/${pathPart}/docdb/${docdb}`;

//   const res = await fetch(url, {
//     headers: {
//       Authorization: `Bearer ${token}`,
//       Accept: "application/json",
//     },
//   });

//   if (!res.ok) {
//     const txt = await res.text();
//     throw new Error(`EPO API 호출 실패: ${txt}`);
//   }

//   const data = await res.json();
//   //   console.log("🚀 [data] data", data);
//   //   console.dir(
//   //     data["ops:world-patent-data"]["ops:patent-family"]["ops:family-member"],
//   //     { depth: null, colors: true },
//   //   );
//   const familyMembers = data["ops:world-patent-data"]["ops:patent-family"][
//     "ops:family-member"
//   ] as FamilyMember[];

//   const koreanApplicationReference =
//     findKoreanApplicationReference(familyMembers);

//   if (koreanApplicationReference) {
//     return {
//       formErrors: [
//         `This PCT application has already entered the Korean national phase(Application No. ${koreanApplicationReference.docNumber}, filed ${koreanApplicationReference.date}). You can’t create another entry.`,
//       ],
//     };
//   }

//   return { family: data };
// };

type Applicant = {
  id: string;
  name_kr: string;
  name_en: string;
  nationality: string;
  id_number: string;
  zipcode: string;
  address_kr: string;
  address_en: string;
  residence_country: string;
  client_code: string;
};

export type Inventor = {
  id: string;
  user_id: string;

  name_kr: string;
  name_en: string | null;

  id_number: string | null;

  nationality: string | null;
  residence_country: string | null;

  address_kr: string | null;
  address_en: string | null;
  zipcode: string | null;

  created_at: string;
  updated_at: string;
};

function useResponsiveIsHidden() {
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    // Tailwind의 md(768px 이상)를 기준으로
    const mediaQuery = window.matchMedia("(max-width: 1280px)");

    const handleResize = () => {
      setIsHidden(mediaQuery.matches); // true = 숨김 (작은 화면)
    };

    handleResize(); // 초기 실행
    mediaQuery.addEventListener("change", handleResize);

    return () => mediaQuery.removeEventListener("change", handleResize);
  }, []);

  return [isHidden, setIsHidden] as const;
}

/**
 * PCT 출원번호(PCT/KR2025/000123)를 docdb 형식(CCccyynnnnnn)으로 변환
 */
function convertPctApplicationToDocdb(pctNumber: string): string | null {
  /* 1) 공백 제거 후 대문자로 통일 */
  const cleaned = pctNumber.trim().toUpperCase();
  // "PCT/KR2025/000123" 같은 형식을 파싱
  const match = cleaned.match(/^PCT\/([A-Z]{2})(\d{4})\/(\d+)$/);
  if (!match) return null;

  const [, country, year, serial] = match;

  const cc = "20"; // 2000년대 기준
  const yy = year.slice(2); // "2025" → "25"
  const paddedSerial = serial.padStart(6, "0"); // 6자리 zero-padding

  return `${country}${cc}${yy}${paddedSerial}`; // ✅ kind code 제거
}

/**
 * PCT 공개번호(WO2022/117128)를 docdb 형식(WOyyyynnnnnn)으로 변환 (kind code 제외)
 */
function convertPctPublicationToDocdb(
  publicationNumber: string,
): string | null {
  /* 1) 공백 제거 후 대문자로 통일 */
  const cleaned = publicationNumber.trim().toUpperCase();
  // 예: "WO2022/117128"
  const match = cleaned.match(/^WO(\d{4})\/(\d+)$/);
  if (!match) return null;

  const [, year, serial] = match;
  const paddedSerial = serial.padStart(6, "0"); // 항상 6자리로 맞춤

  return `WO${year}${paddedSerial}`;
}

const convertToDocdb = (input: string, selectedType: string) => {
  if (selectedType === "applicationNumber") {
    console.log("🚀 [convertToDocdb] convertPctApplicationToDocdb", input);
    return convertPctApplicationToDocdb(input);
  } else if (selectedType === "publicationNumber") {
    console.log("🚀 [convertToDocdb] convertPctPublicationToDocdb", input);
    return convertPctPublicationToDocdb(input);
  } else {
    console.log("🚀 [convertToDocdb] null");
    return null;
  }
};

export default function Start({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { user } = loaderData;
  //   console.log("🚀 [loaderData] loaderData", loaderData);
  const [isHidden, setIsHidden] = useResponsiveIsHidden();
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [croppedImage, setCroppedImage] = useState<File | null>(null);
  const [isInlineOpen, setIsInlineOpen] = useState(false);
  const [inventorName, setInventorName] = useState("");
  const [inventorAddress, setInventorAddress] = useState("");
  const [selectedType, setSelectedType] = useState("applicationNumber");
  const fetcher = useFetcher();
  console.log("🚀 [actionData] actionData in start.tsx", fetcher.data?.pctInfo);

  // 3. placeholder 값 조건부 설정
  const placeholderMap: Record<string, string> = {
    applicationNumber: "PCT/KR2025/000000",
    publicationNumber: "WO2025/000000",
  };
  const [isUrgent, setIsUrgent] = useState(false);

  // ✅ 총 금액 계산
  const basePrice = 299;
  const urgentFee = 79;
  const totalPrice = isUrgent ? basePrice + urgentFee : basePrice;

  const { revalidate } = useRevalidator();

  const handleImageSelect = (file: File) => {
    setImageFile(file);
    setShowCropper(true);
  };
  const [isLoading, setIsLoading] = useState(true);
  const [filePath, setFilePath] = useState<string | null>(null);
  const navigate = useNavigate();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedApplicants, setSelectedApplicants] = useState<Applicant[]>([]);
  const [selectedInventors, setSelectedInventors] = useState<Inventor[]>([]);
  const [pctApplicationNumber, setPctApplicationNumber] = useState(""); // 1. state 생성
  // const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false);
  const [isSubmittingDraft, setIsSubmittingDraft] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCanceled, setIsCanceled] = useState(false);
  const [existingDraftId, setExistingDraftId] = useState<string | null>(null);
  const [existingProcessId, setExistingProcessId] = useState<string | null>(
    null,
  );
  // const [textareaValue, setTextareaValue] = useState("");
  // ✅ Sheet 열림 상태
  const [isApplicantSheetOpen, setIsApplicantSheetOpen] = useState(false);
  const [clientRequest, setClientRequest] = useState("");

  const [isPctApplicationNumberMissing, setIsPctApplicationNumberMissing] =
    useState(false);
  const [isApplicantMissing, setIsApplicantMissing] = useState(false);
  const [isInventorMissing, setIsInventorMissing] = useState(false);
  const [isFileMissing, setIsFileMissing] = useState(false);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [addressEn, setAddressEn] = useState("");
  const [customInventorCountry, setCustomInventorCountry] = useState("");
  const [selectedInventorCountry, setSelectedInventorCountry] = useState("");

  const [customInventorResidenceCountry, setCustomInventorResidenceCountry] =
    useState("");
  const [
    selectedInventorResidenceCountry,
    setSelectedInventorResidenceCountry,
  ] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const prefix = selectedType === "applicationNumber" ? "PCT/" : "WO";

  /* ───────────── 유틸: 영문·숫자만 추출 ───────────── */
  const cleanLettersDigits = (s: string) =>
    s.toUpperCase().replace(/[^A-Z0-9]/g, "");

  /* ───────────── Application (PCT) 포매터 ───────────── */
  function formatApplication(restInput: string) {
    const slashIndex = restInput.indexOf("/");

    /** A) 슬래시가 있었던 자리 제외하고 영·숫 추출 */
    const stripped = cleanLettersDigits(restInput);

    /** B) 파트 추출 */
    const country = stripped.slice(0, 2).replace(/[^A-Z]/g, "");
    const year = stripped.slice(2, 6).replace(/[^0-9]/g, "");
    const serial = stripped.slice(6, 12).replace(/[^0-9]/g, "");

    /** C) 슬래시 삽입 위치 결정
     *    - 사용자가 정확히 6번째에 이미 슬래시를 넣었거나
     *    - 아직 없지만 country+year 길이가 6을 채웠을 때
     */
    const needSlash =
      slashIndex === 6 || // 직접 입력했을 때
      (slashIndex === -1 && serial.length > 0); // 7번째 글자(일련번호)부터 자동

    return `${country}${year}${needSlash ? "/" : ""}${serial}`.slice(0, 17);
  }

  /* ───────────── Publication (WO) 포매터 ───────────── */
  function formatPublication(restInput: string) {
    const slashIndex = restInput.indexOf("/");
    const stripped = cleanLettersDigits(restInput);

    const year = stripped.slice(0, 4).replace(/[^0-9]/g, "");
    const serial = stripped.slice(4, 10).replace(/[^0-9]/g, "");

    const needSlash =
      slashIndex === 4 || (slashIndex === -1 && serial.length > 0);

    return `${year}${needSlash ? "/" : ""}${serial}`.slice(0, 13);
  }

  /* 타입 바꿀 때 프리픽스만 우선 세팅 */
  useLayoutEffect(() => {
    setPctApplicationNumber(prefix);
  }, [prefix]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const raw = el.value.toUpperCase();
    const cursor = el.selectionStart ?? raw.length; // 현재 커서

    /* prefix 보호 */
    if (!raw.startsWith(prefix)) {
      setPctApplicationNumber(prefix);
      return;
    }

    const rest = raw.slice(prefix.length).replace(/\/+/g, "/");
    const formatted =
      selectedType === "applicationNumber"
        ? formatApplication(rest)
        : formatPublication(rest);

    /* 1) 상태 업데이트 */
    setPctApplicationNumber(prefix + formatted);

    /* 2) 다음 프레임에서 커서 복구 */
    requestAnimationFrame(() => {
      const el2 = inputRef.current;
      if (!el2) return;

      /* prefix 길이 + 사용자가 있던 offset(단, 최대 문자열 길이 초과 방지) */
      const nextPos = Math.min(
        prefix.length + (cursor - prefix.length),
        el2.value.length,
      );
      el2.setSelectionRange(nextPos, nextPos);
    });
  };

  const isExpeditedDisabled = false;
  const tooltipMessage =
    "Expedited processing is available for an additional $79. Please contact us for more details.";

  const handleUpload = async (uploadType: "checkout" | "draft") => {
    console.log("🚀 [handleUpload] uploadType", uploadType);
  };

  return (
    <div>
      <div className="flex w-full flex-row items-center justify-between bg-[#0e3359] px-4 py-1.5">
        <h1 className="text-md text-center font-medium text-white">
          National Phase Application
        </h1>
        <h1 className="hidden text-center text-sm font-light text-white md:block">
          Please save your draft before you leave
        </h1>
        <div>
          <Button
            variant="outline"
            className="h-7 rounded-md"
            onClick={() => handleUpload("draft")}
            disabled={isSubmittingDraft}
          >
            {isSubmittingDraft ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              "Save Draft"
            )}
          </Button>
        </div>
      </div>
      <div className="w-full border-b border-gray-300 bg-[#0e3359]">
        <div className="mx-auto w-full rounded-tl-md rounded-tr-md bg-[#f6f9fc] px-[1vw] py-4">
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setIsCanceled(true)}
              >
                <XIcon className="size-4" />
              </Button>
              <span className="text-md font-light text-[#414552]">
                Fill out your National Phase Application
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="min-w-[100px] rounded-md p-3 font-medium"
                onClick={() => setIsHidden(!isHidden)}
              >
                {isHidden ? "Show preview" : "Hide preview"}
              </Button>
              <Button
                variant="default"
                className="min-w-[100px] rounded-md p-3 font-semibold"
                disabled={isSubmittingCheckout}
                onClick={() => handleUpload("checkout")}
              >
                {isSubmittingCheckout ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  "Checkout"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
      <div className="flex min-h-screen w-full flex-col items-stretch justify-center gap-20 lg:flex-row">
        <div
          ref={leftRef}
          className="flex w-full flex-col items-start gap-10 space-y-5 pt-10 pb-20 lg:w-[65%]"
        >
          <div className="mx-auto flex flex-col items-start gap-10 space-y-2">
            <SaveDraftAlert
              isOpen={isCanceled}
              onOpenChange={setIsCanceled}
              onSaveDraft={() => handleUpload("draft")}
              onLeaveWithoutSaving={() => {
                setIsCanceled(false);
                navigate("/dashboard/national-phase-applications");
              }}
            />
            <DialogSaveDraft
              isOpen={isDialogOpen}
              onOpenChange={setIsDialogOpen}
            />
            <fetcher.Form
              method="post"
              action="/applications/national-phase/epo"
            >
              <div className="flex w-full flex-col items-start">
                <Label
                  htmlFor="pctApplicationNumber"
                  className="flex flex-col items-start text-lg"
                >
                  Retrieve PCT Publication Information
                </Label>
                <small className="text-muted-foreground mb-1 max-w-xl text-sm font-light">
                  Enter the application or publication number to retrieve public
                  information from the PCT database.
                </small>
                <div className="flex w-full flex-row items-center gap-2">
                  <Select
                    value={selectedType}
                    onValueChange={(value) => {
                      setSelectedType(value);
                      setPctApplicationNumber("");
                    }}
                  >
                    <SelectTrigger className="max-w-xl">
                      <SelectValue placeholder="select number" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="applicationNumber">
                          Application No.
                        </SelectItem>
                        <SelectItem value="publicationNumber">
                          Publication No.
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {/* ② 실제로 FormData에 들어갈 hidden input */}
                  <Input
                    type="hidden"
                    name="selectedType" // 👈 action()에서 formData.get("selectedType") 로 읽을 키
                    value={selectedType}
                  />
                  <Input
                    ref={inputRef}
                    id="pctApplicationNumber"
                    name="pctApplicationNumber"
                    required
                    type="text"
                    placeholder={placeholderMap[selectedType]}
                    className="w-full max-w-xl"
                    value={pctApplicationNumber} // 2. input에 state 바인딩
                    onChange={handleChange}
                    maxLength={selectedType === "applicationNumber" ? 17 : 13}
                  />
                  <Button type="submit">Search</Button>
                </div>
                {isPctApplicationNumberMissing && (
                  <FormErrorAlert
                    title="PCT application number is required"
                    description="Please enter a PCT application number."
                  />
                )}
                {fetcher.data?.formErrors && fetcher.data.formErrors.length ? (
                  <p className="mt-2 max-w-xl text-sm text-red-600">
                    {fetcher.data.formErrors[0]}
                  </p>
                ) : null}
              </div>
            </fetcher.Form>
            <div>
              {fetcher.data?.pctInfo && (
                <div className="flex flex-col items-start gap-2">
                  <Alert variant="destructive">
                    <AlertCircleIcon />
                    <AlertTitle>
                      The deadline to enter the KR national phase is{" "}
                      {/* 31-month deadline (Luxon) */}
                      {(() => {
                        const pd = fetcher.data?.pctInfo?.priorityDate; // "YYYY-MM-DD"
                        if (!pd) return "-";

                        // ISO 문자열 → DateTime  ➜  31개월 후 ➜  사용자의 브라우저 로캘로 표시
                        return DateTime.fromISO(pd, { zone: "utc" }) // 우선권일
                          .plus({ months: 31 }) // +31개월
                          .setLocale(navigator.language) // 현지 로캘
                          .toLocaleString(DateTime.DATE_MED); // 예: 1 Feb 2025 / 2025. 2. 1.
                      })()}
                    </AlertTitle>
                    <AlertDescription>
                      <p>
                        31&nbsp;months after the&nbsp;priority date of&nbsp;
                        {
                          DateTime.fromISO(fetcher.data.pctInfo.priorityDate, {
                            zone: "utc",
                          }) // "2022-07-01"
                            .setLocale(navigator.language) // 현지 로캘
                            .toLocaleString(DateTime.DATE_MED) // 예: 1 Jul 2022 / 2022. 7. 1.
                        }
                      </p>
                    </AlertDescription>
                  </Alert>
                  <Card className="w-full max-w-xl">
                    <CardHeader>
                      <CardTitle>
                        {fetcher.data.pctInfo.intlApplicationNumber}
                        <span className="ml-2 text-xs font-light">
                          filed on {fetcher.data.pctInfo.intlApplicationDate}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2 text-sm">
                      <p>{fetcher.data.pctInfo.inventionTitle}</p>
                      <div className="text-muted-foreground gap-2">
                        <div className="grid w-full grid-cols-3">
                          <div className="col-span-1">
                            Publication No.(Date)
                          </div>
                          <div className="col-span-2">
                            {fetcher.data.pctInfo.intlPublicationNumber} (
                            {fetcher.data.pctInfo.intlPublicationDate})
                          </div>
                        </div>
                        <div className="grid w-full grid-cols-3">
                          <div className="col-span-1">Applicants</div>
                          <div className="col-span-2">
                            <div className="col-span-2 whitespace-pre-line">
                              {JSON.parse(
                                fetcher.data?.pctInfo?.applicants ?? "[]",
                              ).join("\n")}
                            </div>
                          </div>
                        </div>
                        <div className="grid w-full grid-cols-3">
                          <div className="col-span-1">Inventors</div>
                          <div className="col-span-2">
                            <div className="col-span-2 whitespace-pre-line">
                              {JSON.parse(
                                fetcher.data?.pctInfo?.inventors ?? "[]",
                              ).join("\n")}
                            </div>
                          </div>
                        </div>
                        <div className="grid w-full grid-cols-3">
                          <div className="col-span-1">Priority Claims</div>
                          {/* 번호 (날짜) 형태로 변환해 개행 표시 */}
                          <div className="col-span-2 whitespace-pre-line">
                            {JSON.parse(
                              fetcher.data?.pctInfo?.priorityApplications ??
                                "[]",
                            )
                              .map(
                                (p: { number: string; date: string }) =>
                                  `${p.number} (${p.date})`,
                              )
                              .join("\n")}
                          </div>
                        </div>
                        <div className="grid w-full grid-cols-3">
                          <div className="col-span-1">
                            Earliest Priority Date
                          </div>
                          <div className="col-span-2">
                            {fetcher.data.pctInfo.priorityDate}
                          </div>
                        </div>
                        <div className="grid w-full grid-cols-3">
                          {/* 31개월 국내단계 마감일 */}
                          <div className="col-span-1">31-Month Deadline</div>
                          <div className="col-span-2">
                            {(() => {
                              const pd = fetcher.data?.pctInfo?.priorityDate; // "YYYY-MM-DD"
                              if (!pd) return "-";

                              const date = new Date(pd);
                              date.setMonth(date.getMonth() + 31); // 31 개월 더하기
                              return date.toISOString().slice(0, 10); // "YYYY-MM-DD"
                            })()}
                          </div>
                        </div>
                      </div>
                      <p>{fetcher.data.pctInfo.abstractText}</p>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
            <div className="flex flex-col items-start">
              <Label
                htmlFor="file"
                className="flex flex-col items-start text-lg"
              >
                Provisional Specification File
              </Label>
              <small className="text-muted-foreground max-w-xl text-sm font-light">
                You can upload one file at a time. Supported document types
                include PDF, DOCX, PPTX, and similar formats.
              </small>
              <FileDropzone
                onFileSelect={(file) => {
                  setSelectedFile(file);
                  setIsFileMissing(false);
                }}
              />
              {selectedFile && (
                <div className="mt-4 max-w-xl text-sm text-green-700">
                  selected file: {selectedFile.name} (
                  {(selectedFile.size / 1024).toFixed(1)} KB)
                </div>
              )}
              {isFileMissing && (
                <FormErrorAlert
                  title="File is required"
                  description="Please select a file."
                />
              )}
            </div>
            <div className="mt-6 w-full max-w-xl">
              <Label className="text-lg">Need it urgently?</Label>
              <p className="text-muted-foreground mt-1 text-sm">
                Standard processing takes 3–4 business days. If you need it
                sooner, choose expedited processing and we’ll handle it within 1
                business day for an additional $79.
              </p>

              <div className="mt-3 flex flex-col gap-2">
                <label className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="urgency"
                    value="standard"
                    checked={!isUrgent}
                    onChange={() => setIsUrgent(false)}
                    className="accent-blue-600"
                  />
                  <span className="text-sm">
                    Standard (3–4 business days, no extra charge)
                  </span>
                </label>
                <div
                  className="relative inline-block"
                  onMouseEnter={() => setIsTooltipVisible(true)}
                  onMouseLeave={() => setIsTooltipVisible(false)}
                >
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="radio"
                      name="urgency"
                      value="expedited"
                      checked={isUrgent}
                      onChange={() => setIsUrgent(true)}
                      className="accent-blue-600"
                      disabled={isExpeditedDisabled}
                    />
                    <span
                      className={cn(
                        "text-sm font-medium",
                        isExpeditedDisabled
                          ? "text-muted-foreground"
                          : "text-primary",
                      )}
                    >
                      Expedited (+$79, processed within 1 business day)
                    </span>
                  </label>

                  {isExpeditedDisabled && isTooltipVisible && (
                    <div className="absolute top-full left-0 z-50 mt-2 w-[420px] rounded-md bg-[#FBEAEA] px-3 py-2 text-sm text-[#E2584D] shadow-md">
                      {tooltipMessage}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex w-full flex-col items-start">
              <Label
                htmlFor="clientRequest"
                className="flex flex-col items-start text-lg"
              >
                Request or memo to the staff
              </Label>
              <small className="text-muted-foreground pb-1.5 text-sm font-light">
                You can include specific instructions, deadlines, or internal
                references for our team.
              </small>
              <textarea
                id="clientRequest"
                name="clientRequest"
                placeholder="e.g., This is urgent for our upcoming launch. Please prioritize if possible."
                className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring w-full max-w-xl min-w-[280px] rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
                rows={4}
                value={clientRequest}
                onChange={(e) => setClientRequest(e.target.value)}
              />
            </div>

            {isHidden && (
              <div className="flex w-full flex-col justify-between gap-4 px-0 md:flex-row md:p-4">
                <Button
                  type="button"
                  variant="outline"
                  className="min-w-[250px] rounded-md p-3 font-medium"
                  onClick={() => handleUpload("draft")}
                  disabled={isSubmittingDraft}
                >
                  {isSubmittingDraft ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    "Save Draft"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="default"
                  className="min-w-[250px] rounded-md p-3 font-medium"
                  onClick={() => handleUpload("checkout")}
                  disabled={isSubmittingCheckout}
                >
                  {isSubmittingCheckout ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    "Checkout"
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
        {!isHidden && (
          <div
            ref={rightRef}
            className="w-full bg-[#f5f6f8] px-10 pt-5 pb-7 lg:w-[35%]"
          >
            <div className="sticky top-9">
              <Card className="w-full">
                <CardHeader>
                  <CardTitle>Provisional Patent Application (KIPO)</CardTitle>
                  <CardDescription>
                    A comprehensive service covering all essential steps to file
                    a provisional application with the Korean Intellectual
                    Property Office.
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  {/* 업무 상세 보기 아코디언 */}
                  <Accordion type="single" collapsible className="w-full pb-2">
                    <AccordionItem value="details">
                      <AccordionTrigger className="text-muted-foreground text-sm font-medium">
                        View service details
                      </AccordionTrigger>
                      <AccordionContent>
                        <ul className="text-muted-foreground space-y-2 pl-0 text-sm">
                          {[
                            "Apply for Patent Client Code",
                            "Complete Power of Attorney (POA) for patent attorney representation",
                            "Review of draft specification and drawings",
                            "File provisional application to KIPO (The Korean Intellectual Property Office) via online platform",
                            "Receive and review official filing receipt",
                            "Report filing result to client with submission confirmation",
                            "Provide guidance on post-filing amendments (if needed)",
                            "Send reminder for regular application within 12 months",
                            // ✅ 추가 항목
                            "Draft and provide priority claim statement for regular application",
                          ].map((task, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckIcon className="mt-1 h-4 w-4 flex-shrink-0 self-start text-green-600" />
                              <span>{task}</span>
                            </li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>

                  {/* 비용 정보 */}
                  <div className="text-muted-foreground mt-5 flex justify-between px-2 text-sm">
                    <span>subtotal:</span>
                    <span className="text-sm font-light">${basePrice}</span>
                  </div>

                  {/* Urgent 옵션 */}
                  {isUrgent && (
                    <>
                      <hr className="my-6 border-gray-300" />
                      <div className="text-muted-foreground flex justify-between px-2 text-sm">
                        <span>⚡ Urgent filing (within 1 business day)</span>
                        <span className="text-sm font-light">
                          +${urgentFee}
                        </span>
                      </div>
                    </>
                  )}

                  <Separator className="my-6" />

                  {/* 총 금액 */}
                  <div className="text-black-300 mt-6 flex justify-between px-2 text-sm font-medium">
                    <span className="text-black-300 text-md font-light">
                      Total Fee:
                    </span>
                    <span className="text-black-300 text-md font-semibold">
                      ${totalPrice}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <div className="mt-3 flex w-full flex-col items-center justify-center gap-3 px-0 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-7/9 rounded-md p-3 font-medium"
                  onClick={() => handleUpload("draft")}
                  disabled={isSubmittingDraft}
                >
                  {isSubmittingDraft ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    "Save Draft"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="default"
                  className="w-7/9 rounded-md p-3 font-medium"
                  onClick={() => handleUpload("checkout")}
                  disabled={isSubmittingCheckout}
                >
                  {isSubmittingCheckout ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    "Checkout"
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
