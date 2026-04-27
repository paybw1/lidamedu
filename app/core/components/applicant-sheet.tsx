import { AlertCircleIcon, FileCheck2Icon, MailIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useRevalidator } from "react-router";
import { toast } from "sonner";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/core/components/ui/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/core/components/ui/tabs";
import { browserClient } from "~/core/lib/browser-client";

import { generatePOAClient } from "../lib/generate-pdf.client";
// import { generatePOAClient } from "~/features/applications/screens/provisional-application/start";

import { ImageDropzone } from "./imagedropzone";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import { FileDropzone } from "./ui/filedropzone";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

const signerPositions = [
  { label: "CEO", value: "CEO" },
  { label: "Representative", value: "Representative" },
  { label: "President", value: "President" },
  { label: "Owner", value: "Owner" },
  { label: "Chairman", value: "Chairman" },
  { label: "Managing Director", value: "Managing Director" },
  { label: "Other", value: "etc" }, // 기타 직책
];

const countries = [
  { name: "United States", code: "US" },
  { name: "South Korea", code: "KR" },
  { name: "China", code: "CN" },
  { name: "Japan", code: "JP" },
];

const companyTypes = [
  { label: "Inc.", value: "Inc." },
  { label: "Corp.", value: "Corp." },
  { label: "LLC", value: "LLC" },
  { label: "Ltd.", value: "Ltd." },
  { label: "GmbH", value: "GmbH" },
  { label: "S.A.", value: "S.A." },
  { label: "Other", value: "etc" },
];

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

export function ApplicantSheet({
  isOpen,
  onOpenChange,
  selectedCountry,
  setSelectedCountry,
  rawImage,
  setRawImage,
  finalImage,
  setFinalImage,
  showEditor,
  setShowEditor,
  showCropper,
  setShowCropper,
  croppedImage,
  setCroppedImage,
  title,
  nameEn,
  addressEn,
  setNameEn,
  setAddressEn,
  user,
  selectedApplicants,
  setSelectedApplicants,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCountry: string;
  setSelectedCountry: (country: string) => void;
  rawImage: File | null;
  setRawImage: (image: File | null) => void;
  finalImage: File | null;
  setFinalImage: (image: File | null) => void;
  showEditor: boolean;
  setShowEditor: (show: boolean) => void;
  showCropper: boolean;
  setShowCropper: (show: boolean) => void;
  croppedImage: File | null;
  setCroppedImage: (image: File | null) => void;
  title: string;
  nameEn: string;
  addressEn: string;
  setNameEn: (name: string) => void;
  setAddressEn: (address: string) => void;
  user: any;
  selectedApplicants: Applicant[];
  setSelectedApplicants: (applicants: Applicant[]) => void;
}) {
  // ✅ 공통 입력값
  const [entityType, setEntityType] = useState<"individual" | "company">(
    "company",
  );
  const [signatureUrl, setSignatureUrl] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [companyPrefix, setCompanyPrefix] = useState<string>("");
  const [agreed, setAgreed] = useState(false);
  const [agreed2, setAgreed2] = useState(false);
  const [customPrefix, setCustomPrefix] = useState<string>("");
  const [companyName, setCompanyName] = useState("");
  const [addressEnLine1, setAddressEnLine1] = useState("");
  const [addressEnLine2, setAddressEnLine2] = useState("");

  const { revalidate } = useRevalidator();

  // ✅ 법인 전용
  const [signerPosition, setSignerPosition] = useState("");
  const [signerName, setSignerName] = useState("");
  const [representativeName, setRepresentativeName] = useState("");
  const [customPosition, setCustomPosition] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [customCountry, setCustomCountry] = useState("");

  const handleGeneratePdf = async () => {
    const file = await generatePOAClient({
      elementId: "pdf-area",
      filename: "POA.pdf",
    });
    // console.log("pdf", file);
    if (file) {
      setSelectedFile(file as unknown as File);
    }
  };

  const handleDownloadPOAForm = async () => {
    // ✅ 필수 입력 확인
    if (entityType === "individual") {
      if (!firstName.trim() || !lastName.trim() || !addressEn.trim()) {
        toast.error("Please fill in your first name, last name, and address.");
        return;
      }
    } else if (entityType === "company") {
      if (!companyName.trim() || !companyPrefix.trim() || !addressEn.trim()) {
        toast.error(
          "Please fill in the company name, entity type, and address.",
        );
        return;
      }
    }

    // ✅ 입력이 다 된 경우 → PDF 생성
    const file = await generatePOAClient({
      elementId: "pdf-area",
      filename: "POA.pdf",
    });

    const url = URL.createObjectURL(file as unknown as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "POA.pdf";
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    setNameEn(fullName);
  }, [firstName, lastName]);

  useEffect(() => {
    if (!croppedImage) {
      setSignatureUrl("");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        setSignatureUrl(reader.result);
      }
    };
    reader.readAsDataURL(croppedImage);
  }, [croppedImage]);

  useEffect(() => {
    if (companyPrefix === "etc") {
      setNameEn(companyName + " " + customPrefix);
    } else {
      setNameEn(companyName + " " + companyPrefix);
    }
  }, [companyPrefix, companyName]);

  useEffect(() => {
    setAddressEn(addressEnLine1 + " " + addressEnLine2);
  }, [addressEnLine1, addressEnLine2]);

  const handleSave = async () => {
    // ✅ 국가 입력 검사
    if (!selectedCountry || selectedCountry.trim() === "") {
      toast.error("Please select a nationality.");
      // alert("Please select a country.");
      return;
    }

    if (
      selectedCountry === "etc" &&
      (!customCountry || customCountry.trim() === "")
    ) {
      toast.error("Please select a nationality.");
      return;
    }
    setIsLoading(true);

    try {
      // ✅ 사용자 확인
      const {
        data: { user },
      } = await browserClient.auth.getUser();

      if (!user) {
        toast.error("login is required.");
        return;
      }

      // ✅ 사인 이미지 유효성 검사
      if (!croppedImage) {
        toast.error("please upload a signature image.");
        return;
      }

      // ✅ Supabase Storage에 서명 이미지 업로드
      const filePath = `signatures/${user.id}/${Date.now()}_signature.png`;

      const { error: uploadError } = await browserClient.storage
        .from("signatures")
        .upload(filePath, croppedImage, {
          cacheControl: "3600",
          upsert: false,
          contentType: croppedImage.type || "image/png",
        });

      if (uploadError) {
        console.error("failed to upload signature image:", uploadError.message);
        toast.error("failed to upload signature image.");
        return;
      }

      // ✅ public URL 생성
      const {
        data: { publicUrl },
      } = browserClient.storage.from("signatures").getPublicUrl(filePath);

      // ✅ Supabase에 저장할 데이터 구성
      const insertData = {
        user_id: user.id,
        entity_type: entityType, // ✅ 추가된 필드
        name_en: nameEn,
        address_en: addressEn,
        signature_image_url: publicUrl,
        country: selectedCountry === "etc" ? customCountry : selectedCountry, // ✅ 조건 분기
        has_poa: true,
        signer_position:
          entityType === "company" ? signerPosition : signerPosition,
        signer_name: entityType === "company" ? signerName : signerName,
        representative_name:
          entityType === "company" ? representativeName : representativeName,
      };

      // ✅ Supabase에 삽입 및 삽입된 데이터 반환
      const { data, error } = await browserClient
        .from("entities")
        .insert(insertData)
        .select()
        .single();

      revalidate();

      if (error || !data) {
        console.error("failed to save:", error?.message);
        toast.error("failed to save.");
        return;
      }

      // ✅ selectedApplicants에 새 항목 추가
      const applicantData: Applicant = {
        id: data.id,
        name_kr: data.name_kr || "",
        name_en: data.name_en || "",
        nationality: data.country || "",
        id_number: "", // 필드가 없으므로 빈 문자열로 설정
        zipcode: "", // 필드가 없으므로 빈 문자열로 설정
        address_kr: data.address_kr || "",
        address_en: data.address_en || "",
        residence_country: data.country || "",
        client_code: data.client_code || "",
      };
      setSelectedApplicants([...selectedApplicants, applicantData]);

      toast.success("Applicant saved successfully!");

      // ✅ 입력값 초기화
      setNameEn("");
      setAddressEn("");
      setSignatureUrl("");
      setSignerPosition("");
      setSignerName("");
      setRepresentativeName("");
      setEntityType("company");
      setCroppedImage(null);
      setCompanyName("");
      setCompanyPrefix("");
      setCustomPrefix("");
      setSelectedCountry("");
      setCustomCountry("");
      setAgreed(false);
      setAgreed2(false);
      onOpenChange(false); // 시트 닫기
    } catch (e) {
      console.error("exception occurred:", e);
      toast.error("exception occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <Sheet open={isOpen} onOpenChange={onOpenChange}>
        <SheetContent
          side="left"
          className="mb-10 !w-[600px] !max-w-[600px] overflow-y-auto pb-10"
        >
          <SheetHeader>
            <SheetTitle>Add New Applicant</SheetTitle>
            <SheetDescription>
              Please enter the information for the new applicant.
            </SheetDescription>
          </SheetHeader>

          {/* ✅ Tabs로 구분 */}
          <div className="mx-14 flex flex-col gap-4">
            <Tabs
              defaultValue="company"
              onValueChange={(v) =>
                setEntityType(v as "individual" | "company")
              }
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="company">Company</TabsTrigger>
                <TabsTrigger value="individual">Individual</TabsTrigger>
              </TabsList>
              {/* ✅ Corporation input form */}
              {/* ✅ 국가 선택 */}
              <div className="mt-4 flex flex-col gap-1">
                <Label>Nationality of the applicant</Label>
                <div className="flex w-full flex-row justify-between gap-1">
                  <Select
                    onValueChange={(value) => {
                      if (value === "etc") {
                        setSelectedCountry("etc"); // 초기화 (선택된 국가 없음)
                      } else {
                        setSelectedCountry(value); // 일반 국가 선택 시 설정
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder="Select a nationality"
                        // value는 외부에서 관리하므로 selectedCountry 사용
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {/* <SelectLabel>Nationality of the applicant</SelectLabel> */}
                        {countries.map((country) => (
                          <SelectItem key={country.code} value={country.code}>
                            {country.name}
                          </SelectItem>
                        ))}
                        <SelectItem value="etc">Other nationality</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>

                  {/* ❗ "기타 국가"를 선택했을 때만 input 표시 */}
                  {selectedCountry === "etc" && (
                    <Input
                      placeholder="Enter nationality"
                      value={customCountry}
                      onChange={(e) => {
                        const inputValue = e.target.value;
                        setCustomCountry(inputValue);
                        //   setSelectedCountry(inputValue); // 입력된 국가를 selectedCountry로 설정
                      }}
                    />
                  )}
                </div>

                <Alert variant="destructive">
                  <AlertCircleIcon />
                  <AlertTitle>
                    Nationality should match the country of the address.
                  </AlertTitle>
                  <AlertDescription>
                    <p>
                      Please ensure that the applicant's nationality corresponds
                      to the country of their address.
                    </p>
                    {/* <ul className="list-inside list-disc text-sm">
                      <li>
                        For example, if the address is in the United States, the
                        nationality should also be set to the U.S.
                      </li>
                      <li>
                        If the nationality differs from the address country,
                        please review the information carefully before
                        proceeding.
                      </li>
                    </ul> */}
                  </AlertDescription>
                </Alert>
              </div>
              <TabsContent value="company" className="space-y-4">
                <div className="mt-4 flex flex-col gap-1">
                  <Label>Company Name</Label>

                  <small className="text-muted-foreground">
                    Must match the name on your business registration
                  </small>
                  <div className="flex w-full flex-row justify-between gap-1">
                    <Input
                      value={companyName}
                      placeholder="Company Name"
                      onChange={(e) => setCompanyName(e.target.value)}
                    />
                    {/* ❗ "기타"를 선택했을 때만 input 표시 */}
                    {companyPrefix === "etc" && (
                      <Input
                        placeholder="Entity type"
                        className="w-[160px]"
                        onChange={(e) => {
                          const inputValue = e.target.value;
                          setCustomPrefix(inputValue);
                          //   setSelectedCountry(inputValue); // 입력된 국가를 selectedCountry로 설정
                        }}
                      />
                    )}
                    <Select
                      onValueChange={(value) => {
                        setCompanyPrefix(value);
                      }}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Entity type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {companyTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Address</Label>
                  <small className="text-muted-foreground">
                    Business address of the company
                  </small>
                  <Input
                    value={addressEnLine1}
                    onChange={(e) => setAddressEnLine1(e.target.value)}
                    placeholder="Street Address"
                  />
                  <Input
                    value={addressEnLine2}
                    onChange={(e) => setAddressEnLine2(e.target.value)}
                    placeholder="City, State, Zip Code"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <Label>Delegation Method</Label>
                  <small className="text-muted-foreground">
                    Select the appropriate method to grant Power of Attorney
                  </small>

                  <Tabs defaultValue="digital" className="flex flex-col gap-4">
                    {/* ✅ 위임 유형 선택 Tabs */}
                    <TabsList className="w-full justify-around">
                      <TabsTrigger value="digital">
                        <div className="flex flex-col items-center">
                          <Label>Digital Authorization</Label>
                          {/* <p className="text-muted-foreground text-center text-sm">
                      Use an uploaded signature image to authorize
                      electronically.
                    </p> */}
                        </div>
                      </TabsTrigger>
                      <TabsTrigger value="paper">
                        <div className="flex flex-col items-center">
                          <Label>Paper-Based Authorization</Label>
                          {/* <p className="text-muted-foreground text-center text-sm">
                      Submit a scanned PDF after printing and signing the POA
                      form.
                    </p> */}
                        </div>
                      </TabsTrigger>
                    </TabsList>

                    {/* ✅ 디지털 위임 탭: 이미지 업로드 */}
                    <TabsContent value="digital">
                      <Card>
                        <CardHeader>
                          <CardTitle>Digital Authorization</CardTitle>
                          <CardDescription>
                            Upload a signature image to instantly authorize via
                            electronic Power of Attorney.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-6">
                          <div className="flex flex-col gap-4">
                            <div className="mt-4 flex flex-col gap-1">
                              <Label>Signer's Position</Label>
                              <small className="text-muted-foreground">
                                Position of the person authorized to sign the
                                document
                              </small>
                              <div className="flex flex-row gap-1">
                                <Select
                                  onValueChange={(value) => {
                                    setSignerPosition(value);
                                    if (value !== "etc") setCustomPosition(""); // 기타 아님 → 입력 초기화
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select position" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectGroup>
                                      {signerPositions.map((pos) => (
                                        <SelectItem
                                          key={pos.value}
                                          value={pos.value}
                                        >
                                          {pos.label}
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                                {/* 기타 선택 시 수동 입력 */}
                                {signerPosition === "etc" && (
                                  <Input
                                    value={customPosition}
                                    onChange={(e) =>
                                      setCustomPosition(e.target.value)
                                    }
                                    placeholder="Enter position (e.g. Vice President)"
                                  />
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <Label>Signer's Name</Label>
                              <small className="text-muted-foreground">
                                Full name of the person signing the documents
                              </small>
                              <Input
                                value={signerName}
                                onChange={(e) => setSignerName(e.target.value)}
                              />
                            </div>
                            {signerPosition === "etc" && (
                              <div className="flex flex-col gap-1">
                                <Label>Authorized Signatory's Name</Label>
                                <small className="text-muted-foreground">
                                  Person legally authorized to sign on behalf of
                                  the company
                                </small>
                                <Input
                                  value={representativeName}
                                  onChange={(e) =>
                                    setRepresentativeName(e.target.value)
                                  }
                                />
                              </div>
                            )}
                          </div>
                          <div className="grid gap-3">
                            <Label htmlFor="tabs-demo-name">
                              Signature Image
                            </Label>
                            {croppedImage ? (
                              <div className="relative w-full max-w-xs">
                                <img
                                  src={URL.createObjectURL(croppedImage)}
                                  alt="signature"
                                  className="w-full rounded border object-contain shadow"
                                />
                                <Button
                                  variant="ghost"
                                  onClick={() => setCroppedImage(null)} // ❌ 이미지 초기화
                                  className="absolute top-1 right-1 rounded bg-white/80 px-2 py-1 text-xs hover:bg-white"
                                >
                                  Re-select
                                </Button>
                              </div>
                            ) : (
                              <ImageDropzone
                                rawImage={rawImage}
                                setRawImage={setRawImage}
                                finalImage={finalImage}
                                setFinalImage={setFinalImage}
                                showEditor={showEditor}
                                setShowEditor={setShowEditor}
                              />
                            )}
                          </div>
                        </CardContent>
                        <CardFooter className="flex flex-col items-end gap-4">
                          <div className="flex flex-col items-end gap-1">
                            {/* ✅ span은 커서 적용을 위해 꼭 필요 */}
                            <span
                              className={
                                !croppedImage ? "cursor-not-allowed" : ""
                              }
                            >
                              <Button
                                variant="outline"
                                disabled={!croppedImage}
                                onClick={async () => {
                                  if (!croppedImage) {
                                    toast.error("Signature image is required.");
                                    return;
                                  }
                                  if (!companyName?.trim()) {
                                    toast.error(
                                      "Please enter the company name.",
                                    );
                                    return;
                                  }
                                  if (!signerName?.trim()) {
                                    toast.error(
                                      "Please enter the signer's name.",
                                    );
                                    return;
                                  }
                                  if (!signerPosition) {
                                    toast.error(
                                      "Please enter the signer's position.",
                                    );
                                    return;
                                  }
                                  if (!addressEn?.trim()) {
                                    toast.error(
                                      "Please enter the applicant's address.",
                                    );
                                    return;
                                  }

                                  handleGeneratePdf();
                                }}
                                className={
                                  !croppedImage
                                    ? "pointer-events-none cursor-not-allowed border-gray-300 bg-gray-100 text-gray-400"
                                    : ""
                                }
                              >
                                <FileCheck2Icon className="mr-2" />
                                Generate POA with uploaded signature
                              </Button>
                            </span>

                            {selectedFile && (
                              <div className="flex flex-row items-center gap-1 text-sm font-light text-green-600">
                                {/* 클릭 시 새 탭으로 미리보기 */}
                                <div
                                  className="cursor-pointer hover:underline"
                                  onClick={() => {
                                    const url =
                                      URL.createObjectURL(selectedFile);
                                    window.open(url, "_blank");
                                  }}
                                >
                                  <strong>{selectedFile.name}</strong> (
                                  {(selectedFile.size / 1024).toFixed(1)} KB)
                                </div>
                                {/* X 아이콘 클릭 시 삭제 */}
                                <button
                                  onClick={() => setSelectedFile(null)}
                                  className="text-green-600 hover:text-red-700"
                                  aria-label="Remove file"
                                >
                                  <XIcon className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="flex w-full flex-col items-center">
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id="toggle"
                                disabled={!selectedFile}
                                checked={agreed}
                                onCheckedChange={(checked) =>
                                  setAgreed(Boolean(checked))
                                }
                              />
                              <Label
                                htmlFor="toggle"
                                className="font-bold text-black"
                              >
                                I have read and agree to the Power of Attorney
                                Agreement.
                              </Label>
                            </div>
                          </div>
                        </CardFooter>
                      </Card>
                    </TabsContent>

                    {/* ✅ 종이 기반 위임 탭: PDF 업로드 */}
                    <TabsContent value="paper">
                      <Card>
                        <CardHeader>
                          <CardTitle>Paper-Based Authorization</CardTitle>
                          <CardDescription>
                            Please download the Power of Attorney (POA) form and
                            sign it manually. Send it directly to{" "}
                            <strong>brandit@brandit-ip.com</strong>
                          </CardDescription>
                          <CardDescription>
                            The process usually takes{" "}
                            <strong>2–3 business days</strong> to complete after
                            we receive your signed document.
                            <p className="text-muted-foreground mt-3 text-sm">
                              You{" "}
                              <strong>
                                can complete and submit the application form to
                                us
                              </strong>{" "}
                              before sending back the signed POA.
                            </p>
                            <p className="text-muted-foreground mt-3 text-sm">
                              However, we will{" "}
                              <strong>not be able to submit</strong> the
                              application to the Patent Office until we receive
                              the signed POA.
                            </p>
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-col gap-4">
                            <div className="mt-4 flex flex-col gap-1">
                              <Label>Signer's Position</Label>
                              <small className="text-muted-foreground">
                                Position of the person authorized to sign the
                                document
                              </small>
                              <div className="flex flex-row gap-1">
                                <Select
                                  onValueChange={(value) => {
                                    setSignerPosition(value);
                                    if (value !== "etc") setCustomPosition(""); // 기타 아님 → 입력 초기화
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select position" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectGroup>
                                      {signerPositions.map((pos) => (
                                        <SelectItem
                                          key={pos.value}
                                          value={pos.value}
                                        >
                                          {pos.label}
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                                {/* 기타 선택 시 수동 입력 */}
                                {signerPosition === "etc" && (
                                  <Input
                                    value={customPosition}
                                    onChange={(e) =>
                                      setCustomPosition(e.target.value)
                                    }
                                    placeholder="Enter position (e.g. Vice President)"
                                  />
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <Label>Signer's Name</Label>
                              <small className="text-muted-foreground">
                                Full name of the person signing the documents
                              </small>
                              <Input
                                value={signerName}
                                onChange={(e) => setSignerName(e.target.value)}
                              />
                            </div>
                            {signerPosition === "etc" && (
                              <div className="flex flex-col gap-1">
                                <Label>Authorized Signatory's Name</Label>
                                <small className="text-muted-foreground">
                                  Person legally authorized to sign on behalf of
                                  the company
                                </small>
                                <Input
                                  value={representativeName}
                                  onChange={(e) =>
                                    setRepresentativeName(e.target.value)
                                  }
                                />
                              </div>
                            )}
                          </div>
                        </CardContent>
                        <CardFooter className="flex flex-col items-end gap-2">
                          <Button
                            variant="outline"
                            onClick={handleDownloadPOAForm}
                          >
                            <FileCheck2Icon />
                            Download POA Form
                          </Button>
                          {/* <Button
                            variant="outline"
                            onClick={sendPOAFormToEmail}
                          >
                            <MailIcon />
                            Receive POA Form to {user.email}
                          </Button> */}
                        </CardFooter>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </div>
                <div className="mt-6">
                  <Button
                    onClick={handleSave}
                    disabled={isLoading || !agreed}
                    className="w-full"
                  >
                    {isLoading ? "Saving..." : "Save Applicant"}
                  </Button>
                </div>
              </TabsContent>

              {/* ✅ Individual input form */}

              <TabsContent value="individual" className="mt-4 space-y-4">
                {/* ✅ 이름 입력 */}
                <div className="flex flex-row justify-between gap-2">
                  <div className="flex w-1/2 flex-col gap-1">
                    <Label>First Name</Label>
                    <Input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="e.g., John"
                    />
                  </div>

                  <div className="flex w-1/2 flex-col gap-1">
                    <Label>Last Name</Label>
                    <Input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="e.g., Smith"
                    />
                  </div>
                </div>

                {/* ✅ 주소 입력 */}
                <div className="flex flex-col gap-1">
                  <Label>Address</Label>
                  <small className="text-muted-foreground">
                    Full mailing address in English
                  </small>
                  <Input
                    value={addressEnLine1}
                    onChange={(e) => setAddressEnLine1(e.target.value)}
                    placeholder="Street Address"
                  />
                  <Input
                    value={addressEnLine2}
                    onChange={(e) => setAddressEnLine2(e.target.value)}
                    placeholder="City, State, Zip Code"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Delegation Method</Label>
                  <small className="text-muted-foreground">
                    Select the appropriate method to grant Power of Attorney
                  </small>

                  <Tabs defaultValue="digital" className="flex flex-col gap-4">
                    {/* ✅ 위임 유형 선택 Tabs */}
                    <TabsList className="w-full justify-around">
                      <TabsTrigger value="digital">
                        <div className="flex flex-col items-center">
                          <Label>Digital Authorization</Label>
                          {/* <p className="text-muted-foreground text-center text-sm">
                      Use an uploaded signature image to authorize
                      electronically.
                    </p> */}
                        </div>
                      </TabsTrigger>
                      <TabsTrigger value="paper">
                        <div className="flex flex-col items-center">
                          <Label>Paper-Based Authorization</Label>
                          {/* <p className="text-muted-foreground text-center text-sm">
                      Submit a scanned PDF after printing and signing the POA
                      form.
                    </p> */}
                        </div>
                      </TabsTrigger>
                    </TabsList>

                    {/* ✅ 디지털 위임 탭: 이미지 업로드 */}
                    <TabsContent value="digital">
                      <Card>
                        <CardHeader>
                          <CardTitle>Digital Authorization</CardTitle>
                          <CardDescription>
                            Upload a signature image to instantly authorize via
                            electronic Power of Attorney.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-6">
                          <div className="grid gap-3">
                            <Label htmlFor="tabs-demo-name">
                              Signature Image
                            </Label>
                            {croppedImage ? (
                              <div className="relative w-full max-w-xs">
                                <img
                                  src={URL.createObjectURL(croppedImage)}
                                  alt="signature preview"
                                  className="w-full rounded border object-contain shadow"
                                />
                                <Button
                                  variant="ghost"
                                  onClick={() => setCroppedImage(null)} // ❌ 이미지 초기화
                                  className="absolute top-1 right-1 rounded bg-white/80 px-2 py-1 text-xs hover:bg-white"
                                >
                                  Re-select
                                </Button>
                              </div>
                            ) : (
                              <ImageDropzone
                                rawImage={rawImage}
                                setRawImage={setRawImage}
                                finalImage={finalImage}
                                setFinalImage={setFinalImage}
                                showEditor={showEditor}
                                setShowEditor={setShowEditor}
                              />
                            )}
                          </div>
                        </CardContent>
                        <CardFooter className="flex flex-col items-end gap-4">
                          <div className="flex flex-col items-end gap-1">
                            <span
                              className={
                                !croppedImage ? "cursor-not-allowed" : ""
                              }
                            >
                              <Button
                                variant="outline"
                                disabled={!croppedImage}
                                onClick={async () => {
                                  if (!croppedImage) {
                                    toast.error("Signature image is required.");
                                    return;
                                  }
                                  if (!firstName?.trim()) {
                                    toast.error(
                                      "Please enter the applicant's first name.",
                                    );
                                    return;
                                  }
                                  if (!lastName?.trim()) {
                                    toast.error(
                                      "Please enter the applicant's last name.",
                                    );
                                    return;
                                  }
                                  if (!addressEn?.trim()) {
                                    toast.error(
                                      "Please enter the applicant's address.",
                                    );
                                    return;
                                  }

                                  handleGeneratePdf();
                                }}
                                className={
                                  !croppedImage
                                    ? "pointer-events-none cursor-not-allowed border-gray-300 bg-gray-100 text-gray-400"
                                    : ""
                                }
                              >
                                <FileCheck2Icon className="mr-2" />
                                Generate POA with uploaded signature
                              </Button>
                            </span>
                            {selectedFile && (
                              <div className="flex flex-row items-center gap-1 text-sm font-light text-green-600">
                                {/* 클릭 시 새 탭으로 미리보기 */}
                                <div
                                  className="cursor-pointer hover:underline"
                                  onClick={() => {
                                    const url =
                                      URL.createObjectURL(selectedFile);
                                    window.open(url, "_blank");
                                  }}
                                >
                                  <strong>{selectedFile.name}</strong> (
                                  {(selectedFile.size / 1024).toFixed(1)} KB)
                                </div>
                                {/* X 아이콘 클릭 시 삭제 */}
                                <button
                                  onClick={() => setSelectedFile(null)}
                                  className="text-green-600 hover:text-red-700"
                                  aria-label="Remove file"
                                >
                                  <XIcon className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="flex w-full flex-col items-center">
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id="toggle"
                                disabled={!selectedFile}
                                checked={agreed2}
                                onCheckedChange={(checked) =>
                                  setAgreed2(Boolean(checked))
                                }
                              />
                              <Label
                                htmlFor="toggle"
                                className="font-bold text-black"
                              >
                                I have read and agree to the Power of Attorney
                                Agreement.
                              </Label>
                            </div>
                          </div>
                        </CardFooter>
                      </Card>
                    </TabsContent>

                    {/* ✅ 종이 기반 위임 탭: PDF 업로드 */}
                    <TabsContent value="paper">
                      <Card>
                        <CardHeader>
                          <CardTitle>Paper-Based Authorization</CardTitle>
                          <CardDescription>
                            Please download the Power of Attorney (POA) form and
                            sign it manually. Send it directly to{" "}
                            <strong>brandit@brandit-ip.com</strong>
                          </CardDescription>
                          <CardDescription>
                            The process usually takes{" "}
                            <strong>2–3 business days</strong> to complete after
                            we receive your signed document.
                            <p className="text-muted-foreground mt-3 text-sm">
                              You{" "}
                              <strong>
                                can complete and submit the application form to
                                us
                              </strong>{" "}
                              before sending back the signed POA.
                            </p>
                            <p className="text-muted-foreground mt-3 text-sm">
                              However, we will{" "}
                              <strong>not be able to submit</strong> the
                              application to the Patent Office until we receive
                              the signed POA.
                            </p>
                          </CardDescription>
                        </CardHeader>
                        <CardFooter className="flex flex-col items-end gap-2">
                          <Button
                            variant="outline"
                            onClick={handleDownloadPOAForm}
                          >
                            <FileCheck2Icon />
                            Download POA Form
                          </Button>
                          {/* <Button
                            variant="outline"
                            onClick={sendPOAFormToEmail}
                          >
                            <MailIcon />
                            Receive POA Form to {user.email}
                          </Button> */}
                        </CardFooter>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </div>
                <div className="mt-6">
                  <Button
                    onClick={handleSave}
                    disabled={isLoading || !agreed2}
                    className="w-full"
                  >
                    {isLoading ? "Saving..." : "Save Applicant"}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
        <div
          id="pdf-area"
          className="pointer-events-none absolute top-0 left-0 z-[-9999] hidden h-[297mm] w-[210mm] bg-white p-10 font-serif text-sm text-black"
        >
          <div className="flex flex-col gap-0 text-xs">
            <p>LIDAM IP LAW FIRM</p>
            <p>
              2F, 9-15, Seocho-daero 32-gil, Seocho-gu, Seoul, 06661, Rep. of
              KOREA
            </p>
            <p>Phone: +82 2 6949 6993</p>
            <p>Fax: +82 70 8673 6993</p>
            <p>Email: lidamip@lidamip.com</p>
          </div>

          <h1 className="my-6 text-center text-xl font-bold underline">
            POWER OF ATTORNEY
          </h1>

          <p>
            I/We, the undersigned, <strong>{nameEn}</strong> of{" "}
            <strong>{addressEn}</strong>
          </p>

          <p className="mt-4">
            do hereby appoint LIDAM IP LAW FIRM (attorney code:
            9-2020-100128-7), registered patent attorney of Seoul, Republic of
            Korea, as my/our lawful attorney to take on my/our behalf
            proceedings for:
          </p>

          <p className="mt-4">
            Title of Invention: <strong>{title}</strong>
          </p>

          <p className="mt-4">
            before the Korean Intellectual Property Office, and further empower
            said attorney, if necessary, to do any or all of the following:
          </p>

          <div className="mt-4 flex flex-col gap-2">
            {[...Array(14)].map((_, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="min-w-[1.5rem] text-right">{i + 1}.</span>
                <p className="flex-1">
                  {
                    [
                      "To take all necessary proceedings for the filing, prosecution and registration of said application.",
                      "To divide, convert, abandon or withdraw said application.",
                      "To withdraw or abandon a petition, an opposition, a request, a demand, an administrative petition or a suit made in relation to said application.",
                      "To claim priority under Article 55(1) of the Patent Law or Article 11 of Utility Model Law, or withdraw it.",
                      "To make a request for technical evaluation.",
                      "To withdraw an application for registration of an extension of the term of a patent right.",
                      "To appoint and to revoke sub-agents.",
                      "To counteract against an opposition in relation to said application.",
                      "To make an appeal against a decision of rejection of said application or of an amendment, or against a ruling for revocation to the Industrial Property Tribunal, the Patent Court or the Supreme Court.",
                      "To make an administrative petition or suit from dissatisfaction with an administrative action.",
                      "To act as the patent administrator under Article 5 of the Patent Law.",
                      "To perform all other formalities and acts under the provisions concerned with the Patent, Utility Model, Design and Trademark Laws of Korea or any Order issued therefrom before and after the completion of such registration.",
                      "To file application to renew the term of the said registration and to file application to register the reclassification goods of the said registration.",
                      "To file address and name change for the said applicant.",
                    ][i]
                  }
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 text-right">
            <p>
              {new Date().toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>

            <p className="mt-1">
              <strong>{nameEn}</strong>
            </p>

            <div className="mt-6 inline-flex items-center gap-2">
              By:{" "}
              {signatureUrl ? (
                <img src={signatureUrl} alt="signature" className="w-[200px]" />
              ) : (
                <div className="h-[60px] w-[200px] border-b border-dashed" />
              )}
            </div>
            <div className="text-md flex flex-row justify-end gap-2">
              <div>{signerName ? <strong>{signerName}</strong> : null}</div>
              <span>&nbsp; / &nbsp;</span>
              <div>
                {signerPosition ? <strong>{signerPosition}</strong> : null}
              </div>
            </div>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
