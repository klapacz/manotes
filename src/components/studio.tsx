import { useMutation } from "@tanstack/react-query";
import { type KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { sqlocal, type RawResultData } from "@/sqlocal/client";

export function Studio() {
  const submit = useMutation({
    async mutationFn({ query }: { query: string }) {
      console.log("foobar");
      const result = await sqlocal.execSQL(query, []);
      return result;
    },
  });

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      console.log("executing");
      event.preventDefault();
      submit.mutate({ query: event.currentTarget.value });
    }
  };

  return (
    <div className="mt-2">
      <Textarea
        className="font-mono"
        onKeyDown={handleKeyDown}
        defaultValue="SELECT * FROM NOTES;"
      />
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
