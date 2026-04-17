import React, { useState, useRef } from 'react';
import { AlertCircle, CheckCircle2, Search, FileSpreadsheet, Info, X, AlertTriangle, UploadCloud, Car, FileUp, Download, Lock, ShieldCheck } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function App() {
  const [sheetData, setSheetData] = useState<string[]>(["40가1234", "50우2341", "65우2473", "308누3234", "35가0317"]);
  const [excludedVehicles, setExcludedVehicles] = useState<string[]>(["40가1234", "35가0317"]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadSuccess, setLoadSuccess] = useState(true);
  const [fileName, setFileName] = useState<string>('직원차량_목록.csv');

  const [adminCodeInput, setAdminCodeInput] = useState('');
  const [isAdminVerified, setIsAdminVerified] = useState(false);
  const ADMIN_CODE = "nyj1445"; // Predefined manager code

  const handleAdminVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminCodeInput === ADMIN_CODE) {
      setIsAdminVerified(true);
      setLoadError('');
    } else {
      setLoadError('관리자 인증번호가 일치하지 않습니다.');
      setIsAdminVerified(false);
    }
  };

  const [checkDate, setCheckDate] = useState(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().split('T')[0];
  });
  const [plateNumber, setPlateNumber] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: 'violation' | 'compliant' | 'not-found' | 'error';
    plate: string;
    message: string;
  }>({
    isOpen: false,
    type: 'compliant',
    plate: '',
    message: ''
  });

  const [violationList, setViolationList] = useState<Array<{
    id: string;
    plate: string;
    checkDate: string;
    isEmployee: boolean;
    timestamp: Date;
  }>>([]);

  const normalizePlate = (plate: string) => plate.replace(/[\s\-]/g, '');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setLoadError('');
    setLoadSuccess(false);
    setFileName(file.name);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      
      if (workbook.SheetNames.length === 0) {
        throw new Error('엑셀 파일에 시트가 없습니다.');
      }

      // Try to find '직원차량번호' sheet, otherwise use the first sheet
      const targetSheetName = workbook.SheetNames.find(name => name === '직원차량번호') || workbook.SheetNames[0];
      const worksheet = workbook.Sheets[targetSheetName];
      
      // Convert sheet to array of arrays
      const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
      
      let seqIndex = -1;
      let plateIndex = -1;
      let excludeIndex = -1;
      let headerRowIndex = -1;

      // Find headers for "순번", "직원차량번호" (or similar), and "제외차량"
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!Array.isArray(row)) continue;
        
        // Use Array.from to handle sparse arrays from XLSX, ensuring no undefined cells are passed to findIndex
        const normalizedRow = Array.from(row).map(cell => String(cell || '').replace(/\s+/g, ''));
        
        const sIdx = normalizedRow.findIndex(cell => cell && (cell.includes('순번') || cell === 'no' || cell === '번호'));
        const pIdx = normalizedRow.findIndex(cell => cell && cell.includes('차량번호'));
        const eIdx = normalizedRow.findIndex(cell => cell && cell.includes('제외차량'));
        
        if (sIdx !== -1 && pIdx !== -1) {
          seqIndex = sIdx;
          plateIndex = pIdx;
          excludeIndex = eIdx; // Might be -1 if not found, that's okay
          headerRowIndex = i;
          break;
        }
      }

      let plates: string[] = [];
      let excludedPlates: string[] = [];

      if (headerRowIndex !== -1) {
        // Headers found, extract data where BOTH columns are filled
        for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!Array.isArray(row)) continue;
          
          const seqVal = row[seqIndex];
          const plateVal = row[plateIndex];
          
          const isSeqFilled = seqVal !== undefined && seqVal !== null && String(seqVal).trim() !== '';
          const isPlateFilled = plateVal !== undefined && plateVal !== null && String(plateVal).trim() !== '';
          
          if (isSeqFilled && isPlateFilled) {
            const plateStr = String(plateVal).trim();
            plates.push(plateStr);

            // Check if this vehicle is excluded
            if (excludeIndex !== -1) {
              const excludeVal = row[excludeIndex];
              if (excludeVal !== undefined && excludeVal !== null) {
                const strExclude = String(excludeVal).trim().toLowerCase();
                if (strExclude === 'o' || strExclude === 'ㅇ') {
                  excludedPlates.push(plateStr);
                }
              }
            }
          }
        }
      } else {
        // Fallback: If headers are not found, assume column 0 is sequence and the next filled column is plate
        for (let i = 0; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!Array.isArray(row) || row.length < 2) continue;
          
          const seqVal = row[0];
          const plateVal = row.slice(1).find(cell => cell !== undefined && cell !== null && String(cell).trim() !== '');
          
          const isSeqFilled = seqVal !== undefined && seqVal !== null && String(seqVal).trim() !== '';
          const isPlateFilled = plateVal !== undefined;
          
          if (isSeqFilled && isPlateFilled) {
            plates.push(String(plateVal).trim());
          }
        }
      }
      
      if (plates.length === 0) {
        throw new Error('유효한 차량 데이터를 찾을 수 없습니다. "순번"과 "직원차량번호" 열이 모두 채워져 있는지 확인해주세요.');
      }

      setExcludedVehicles(excludedPlates.map(normalizePlate));
      setSheetData(plates.map(normalizePlate));
      setLoadSuccess(true);
    } catch (err: any) {
      setLoadError(err.message || '파일을 읽는 중 오류가 발생했습니다.');
      setSheetData([]);
      setFileName('');
    } finally {
      setIsLoading(false);
      // Reset input so the same file can be uploaded again if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCheck = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!plateNumber) {
      setModalState({
        isOpen: true,
        type: 'error',
        plate: '',
        message: '차량번호를 입력해주세요.'
      });
      return;
    }

    if (sheetData.length === 0) {
      setModalState({
        isOpen: true,
        type: 'error',
        plate: '',
        message: '먼저 엑셀 파일을 업로드해주세요.'
      });
      return;
    }

    const normalizedInput = normalizePlate(plateNumber);
    
    // Check if the vehicle is excluded
    if (excludedVehicles.includes(normalizedInput)) {
      setModalState({
        isOpen: true,
        type: 'compliant', // Or we could create a new 'excluded' type, but 'compliant' shows a green check
        plate: plateNumber,
        message: `[${plateNumber}] 2부제 제외 차량으로 운행 가능합니다.`
      });
      return;
    }

    // Check if the input plate is in the sheet data
    // We require an exact match to avoid false positives.
    const isRegistered = sheetData.includes(normalizedInput);

    // Extract last digit
    const numbersOnly = plateNumber.replace(/[^0-9]/g, '');
    if (numbersOnly.length === 0) {
      setModalState({
        isOpen: true,
        type: 'error',
        plate: plateNumber,
        message: '차량번호에서 숫자를 찾을 수 없습니다.'
      });
      return;
    }

    const lastDigit = parseInt(numbersOnly.slice(-1), 10);
    const selectedDay = new Date(checkDate).getDate();

    const isEvenDay = selectedDay % 2 === 0;
    const isEvenPlate = lastDigit % 2 === 0;

    const employeeStatus = isRegistered ? '정상 차량입니다.' : '외부 차량입니다.';

    if (isEvenDay !== isEvenPlate) {
      // Violation
      setModalState({
        isOpen: true,
        type: 'violation',
        plate: plateNumber,
        message: `[${plateNumber}] ${employeeStatus}\n2부제 위반차량입니다.`
      });
      
      setViolationList(prev => [{
        id: Date.now().toString(),
        plate: plateNumber,
        checkDate: checkDate,
        isEmployee: isRegistered,
        timestamp: new Date()
      }, ...prev]);
    } else {
      // Compliant
      setModalState({
        isOpen: true,
        type: 'compliant',
        plate: plateNumber,
        message: `[${plateNumber}] ${employeeStatus}\n2부제 제외 차량으로 운행 가능합니다.`
      });
    }
  };

  const closeModal = () => setModalState(prev => ({ ...prev, isOpen: false }));

  const downloadViolationList = () => {
    if (violationList.length === 0) return;

    const dataToExport = violationList.map((record, index) => ({
      '순번': violationList.length - index,
      '차량번호': record.plate,
      '단속일자': record.checkDate,
      '구분': record.isEmployee ? '직원차량' : '외부차량',
      '단속시간': record.timestamp.toLocaleTimeString('ko-KR')
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '위반차량내역');
    
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `위반차량내역_${today}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-blue-200">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Car className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">남양주시 차량 2부제 위반 단속 시스템</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Step 1: Data Integration */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-sm font-bold">1</span>
                데이터 연동
              </h2>
              <p className="text-sm text-gray-500 mt-1 ml-8">단속 대상 차량 목록이 있는 엑셀 파일을 업로드합니다.</p>
            </div>
            {isAdminVerified && (
              <button
                onClick={() => {
                  setIsAdminVerified(false);
                  setAdminCodeInput('');
                  setLoadError('');
                }}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                title="인증 해제 및 닫기"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          
          <div className="p-6 space-y-4">
            {!isAdminVerified ? (
              <form onSubmit={handleAdminVerify} className="space-y-4 max-w-sm">
                <div>
                  <label htmlFor="admin-code" className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-gray-400" />
                    관리자 인증번호
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      id="admin-code"
                      value={adminCodeInput}
                      onChange={(e) => setAdminCodeInput(e.target.value)}
                      placeholder="관리자 인증번호 입력"
                      className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                    >
                      인증
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 p-3 rounded-lg border border-blue-100 mb-2">
                  <ShieldCheck className="w-5 h-5 text-blue-600" />
                  <p>관리자 인증이 완료되었습니다. 파일을 업로드할 수 있습니다.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 items-center">
                  <div className="relative flex-1 w-full">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept=".xlsx, .xls, .csv"
                      className="hidden"
                      id="file-upload"
                    />
                    <label
                      htmlFor="file-upload"
                      className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                        fileName ? 'border-blue-300 bg-blue-50 hover:bg-blue-100' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        {isLoading ? (
                          <UploadCloud className="w-8 h-8 text-blue-500 animate-bounce mb-2" />
                        ) : (
                          <FileUp className={`w-8 h-8 mb-2 ${fileName ? 'text-blue-500' : 'text-gray-400'}`} />
                        )}
                        <p className="mb-2 text-sm text-gray-500">
                          {isLoading ? (
                            <span className="font-semibold text-blue-600">파일을 읽는 중...</span>
                          ) : fileName ? (
                            <span className="font-semibold text-blue-600">{fileName}</span>
                          ) : (
                            <><span className="font-semibold">클릭하여 파일 업로드</span> 또는 드래그 앤 드롭</>
                          )}
                        </p>
                        {!fileName && !isLoading && (
                          <p className="text-xs text-gray-500">XLSX, XLS, CSV 파일 지원</p>
                        )}
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Status Messages */}
            {loadError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p>{loadError}</p>
              </div>
            )}
            {loadSuccess && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 p-3 rounded-lg border border-green-200">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <p>성공적으로 데이터를 불러왔습니다. (총 {sheetData.length}대 등록됨)</p>
              </div>
            )}
          </div>
        </section>

        {/* Step 2: Enforcement Check */}
        <section className={`bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden transition-opacity duration-300 ${sheetData.length === 0 ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
          <div className="p-6 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-sm font-bold">2</span>
              위반 차량 단속
            </h2>
            <p className="text-sm text-gray-500 mt-1 ml-8">날짜와 차량번호를 입력하여 2부제 위반 여부를 확인합니다.</p>
          </div>

          <form onSubmit={handleCheck} className="p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="sm:col-span-1">
                <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">
                  단속 기준일
                </label>
                <input
                  type="date"
                  id="date"
                  value={checkDate}
                  onChange={(e) => setCheckDate(e.target.value)}
                  className="block w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="plate" className="block text-sm font-medium text-gray-700 mb-1">
                  차량번호 입력
                </label>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      id="plate"
                      value={plateNumber}
                      onChange={(e) => setPlateNumber(e.target.value)}
                      placeholder="예: 12가 3456"
                      className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-medium"
                    />
                  </div>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center px-6 py-2.5 border border-transparent text-sm font-medium rounded-xl shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                  >
                    조회
                  </button>
                </div>
              </div>
            </div>
          </form>
        </section>

        {/* Step 3: Violation List */}
        <section className={`bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden transition-opacity duration-300 ${sheetData.length === 0 ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
          <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-700 text-sm font-bold">3</span>
                위반 차량 목록
              </h2>
              <p className="text-sm text-gray-500 mt-1 ml-8">단속된 위반 차량의 기록입니다.</p>
            </div>
            {violationList.length > 0 && (
              <div className="flex items-center gap-3">
                <span className="bg-red-100 text-red-700 py-1 px-3 rounded-full text-sm font-medium">
                  총 {violationList.length}건
                </span>
                <button
                  onClick={downloadViolationList}
                  className="flex items-center gap-1 text-sm bg-white border border-gray-300 text-gray-700 py-1.5 px-3 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  엑셀 다운로드
                </button>
              </div>
            )}
          </div>
          
          <div className="p-0">
            {violationList.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                단속된 위반 차량이 없습니다.
              </div>
            ) : (
              <ul className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                {violationList.map(record => (
                  <li key={record.id} className="p-4 sm:px-6 hover:bg-gray-50 transition-colors flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="bg-red-100 p-2 rounded-lg">
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{record.plate}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {record.checkDate} 단속 | {record.isEmployee ? '정상 등록' : '외부차량'}
                        </p>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 font-medium">
                      {record.timestamp.toLocaleTimeString('ko-KR')}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>

      {/* Modal Popup */}
      {modalState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-end p-2">
              <button onClick={closeModal} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="px-6 pb-8 pt-2 text-center">
              <div className="flex justify-center mb-4">
                {modalState.type === 'violation' && (
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                    <AlertCircle className="w-8 h-8 text-red-600" />
                  </div>
                )}
                {modalState.type === 'compliant' && (
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                  </div>
                )}
                {modalState.type === 'not-found' && (
                  <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
                    <AlertTriangle className="w-8 h-8 text-yellow-600" />
                  </div>
                )}
                {modalState.type === 'error' && (
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                    <Info className="w-8 h-8 text-gray-600" />
                  </div>
                )}
              </div>
              
              <h3 className={`text-xl font-bold mb-2 ${
                modalState.type === 'violation' ? 'text-red-600' :
                modalState.type === 'compliant' ? 'text-green-600' :
                modalState.type === 'not-found' ? 'text-yellow-600' :
                'text-gray-900'
              }`}>
                {modalState.type === 'violation' ? '위반 차량' :
                 modalState.type === 'compliant' ? '정상 차량' :
                 modalState.type === 'not-found' ? '없는 차량' :
                 '알림'}
              </h3>
              
              <p className="text-gray-600 text-base font-medium whitespace-pre-line">
                {modalState.message}
              </p>

              <button
                onClick={closeModal}
                className="mt-8 w-full inline-flex justify-center items-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-xl shadow-sm text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

