import { Check, ChevronsUpDown } from "lucide-react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/core/components/ui/popover";
import { restCountries } from "~/core/lib/countries";
import { cn } from "~/core/lib/utils";

// ✅ 최상단에 고정으로 표시할 인기 국가 목록
const popularCountries = [
  { name: "United States", code: "US" },
  { name: "South Korea", code: "KR" },
  { name: "European Union", code: "EU" },
  { name: "China", code: "CN" },
  { name: "Japan", code: "JP" },
];

// ✅ 그 외 국가 목록 (예시, 실제로는 ISO 국가 목록 전체 사용 가능)
// const otherCountries = [
//   { value: "AU", label: "Australia" },
//   { value: "BR", label: "Brazil" },
//   { value: "CA", label: "Canada" },
//   { value: "FR", label: "France" },
//   { value: "DE", label: "Germany" },
//   { value: "IN", label: "India" },
//   { value: "MX", label: "Mexico" },
//   { value: "RU", label: "Russia" },
//   { value: "ES", label: "Spain" },
//   { value: "GB", label: "United Kingdom" },
//   // ...필요 시 더 추가
// ];

const allCountries = [...popularCountries, ...restCountries];

export function CountryCombo({
  onSelect,
}: {
  onSelect: (country: { code: string; name: string }) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {value
            ? allCountries.find((c) => c.code === value)?.name
            : "Select country..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-h-[300px] w-full overflow-y-auto p-0">
        <Command>
          <CommandInput placeholder="Search country..." className="h-9" />
          <CommandList className="max-h-[500px] overflow-y-auto">
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup heading="Popular Countries">
              {popularCountries.map((country) => (
                <CommandItem
                  key={country.code}
                  value={country.code}
                  onSelect={(currentValue) => {
                    setValue(currentValue === value ? "" : currentValue);
                    setOpen(false);
                  }}
                >
                  {country.name}
                  <Check
                    className={cn(
                      "ml-auto",
                      value === country.code ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandGroup heading="All Countries">
              {allCountries.map((country) => (
                <CommandItem
                  key={country.code}
                  value={country.code}
                  onSelect={(currentValue) => {
                    setValue(currentValue === value ? "" : currentValue);
                    setOpen(false);
                  }}
                >
                  {country.name}
                  <Check
                    className={cn(
                      "ml-auto",
                      value === country.code ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
