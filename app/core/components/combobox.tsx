import { Check, ChevronsUpDown, PlusIcon, XIcon } from "lucide-react";
import * as React from "react";

import { Button } from "~/core/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/core/components/ui/command";
import { Label } from "~/core/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/core/components/ui/popover";
import { cn } from "~/core/lib/utils";

import { FormErrorAlert } from "./ui/form-error-alert";

type ComboboxProps = {
  comboName: string;
  labelName: string;
  description: string;
  dbItem: any[];
  items: any[];
  setItems: React.Dispatch<React.SetStateAction<any[]>>;
  onClick: () => void;
  isApplicantMissing: boolean;
  isInventorMissing: boolean;
  onAddNew?: () => void; // ✅ 추가: "Add new applicant" 클릭 시 실행할 함수
};

export function Combobox({
  comboName,
  labelName,
  description,
  dbItem,
  items,
  setItems,
  onClick,
  isApplicantMissing,
  isInventorMissing,
  onAddNew,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const isSelected = (item: any) =>
    items.some((selected) => selected.id === item.id);

  const toggleSelection = (item: any) => {
    if (isSelected(item)) {
      setItems((prev) => prev.filter((selected) => selected.id !== item.id));
      console.log("removed", items);
    } else {
      setItems((prev) => [...prev, item]);
      console.log("added", items);
    }
  };

  const removeSelected = (id: string) => {
    const updated = items.filter((a) => a.id !== id);
    setItems(updated);
  };

  return (
    <div className="w-full max-w-xl min-w-[280px]">
      <Label htmlFor={comboName} className="flex flex-col items-start text-lg">
        {labelName}
      </Label>

      <small className="text-muted-foreground pb-1.5 text-sm font-light">
        {description}
      </small>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
            onClick={onClick}
          >
            {items.length === 0
              ? `Click to select or add ${comboName}`
              : `${items.length} ${comboName}${items.length === 1 ? "" : "s"} selected`}

            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        {isApplicantMissing && comboName === "applicant" && (
          <FormErrorAlert
            title={`Applicant is required`}
            description={`Please select an applicant.`}
          />
        )}
        {isInventorMissing && comboName === "inventor" && (
          <FormErrorAlert
            title={`Inventor is required`}
            description={`Please select an inventor.`}
          />
        )}
        <PopoverContent className="w-full min-w-[360px] p-0 md:min-w-[500px]">
          <Command shouldFilter={true}>
            <CommandInput
              placeholder={`Search ${comboName}...`}
              className="h-9"
            />
            <CommandList>
              <CommandEmpty>No {comboName} found.</CommandEmpty>
              <CommandGroup>
                {/* 관리 버튼: 상단 */}
                {/* ✅ "Add new ..." 버튼 */}
                <CommandItem
                  onSelect={() => {
                    setOpen(false); // 팝오버 닫고
                    if (onAddNew) onAddNew(); // Sheet 열기 (외부 함수 실행)
                  }}
                  className="w-full max-w-xl min-w-[280px]"
                >
                  <PlusIcon className="mr-2 h-4 w-4" />
                  Add new {comboName}
                </CommandItem>
                {dbItem.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.name_en}
                    onSelect={() => {
                      toggleSelection(item);
                      setOpen(false);
                    }}
                    className="flex cursor-pointer items-start gap-2"
                  >
                    {/* 왼쪽 체크 아이콘 */}
                    <Check
                      className={cn(
                        "mt-1 h-4 w-4",
                        isSelected(item) ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {/* 두 줄로 구성된 이름+주소 */}
                    <div className="flex flex-col text-left">
                      <span>{item.name_en}</span>
                      <span className="text-muted-foreground text-xs">
                        {item.address_en}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {/* 🔽 선택된 항목 출력 영역 */}
      <div className="mt-3 space-y-2">
        {items.map((applicant) => (
          <SelectedCard
            key={applicant.id}
            name={applicant.name_en}
            onRemove={() => removeSelected(applicant.id)}
          />
        ))}
      </div>
    </div>
  );
}

function SelectedCard({
  name,
  onRemove,
}: {
  name: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
      <span className="text-sm font-medium">{name}</span>
      <Button
        variant="ghost"
        size="icon"
        className="ml-2 h-5 w-5"
        onClick={onRemove}
      >
        <XIcon className="text-muted-foreground h-4 w-4" />
      </Button>
    </div>
  );
}
