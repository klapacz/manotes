import { useMutation } from "@tanstack/react-query";
import { useRef, type KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { sqlocal, type RawResultData } from "@/sqlocal/client";
import { Button } from "./ui/button";

export function Studio() {
  const ref = useRef<HTMLTextAreaElement>(null);
  const submit = useMutation({
    async mutationFn({ query }: { query: string }) {
      const result = await sqlocal.execSQL(query, []);
      return result;
    },
    onError(err) {
      console.error(err);
    },
  });

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      submit.mutate({ query: event.currentTarget.value });
    }
  };

  return (
    <div className="mt-2">
      <div className="grid gap-2">
        <Textarea
          className="font-mono"
          onKeyDown={handleKeyDown}
          defaultValue="SELECT * FROM notes;"
          ref={ref}
        />
        <div>
          <Button
            disabled={submit.isPending}
            onClick={() =>
              ref.current && submit.mutate({ query: ref.current.value })
            }
          >
            Run
          </Button>
        </div>
      </div>
      {submit.data && <ResultTable data={submit.data} />}
    </div>
  );
}

function ResultTable({ data }: { data: RawResultData }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {data.columns.map((column, index) => (
              <th
                key={index}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {Array.isArray(row)
                ? row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="px-6 py-4 whitespace-nowrap text-sm text-gray-500"
                    >
                      {JSON.stringify(cell)}
                    </td>
                  ))
                : data.columns.map((column, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="px-6 py-4 whitespace-nowrap text-sm text-gray-500"
                    >
                      {JSON.stringify((row as any)[column])}
                    </td>
                  ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
