const kmzFiles = import.meta.glob('../kmz-layers/*.kmz', {
  eager: true,
  query: '?url',
  import: 'default',
});

const layerNames = {
  WIUP: 'Wilayah Izin Usaha Pertambangan',
  WDPA_May2019_IDN: 'Kawasan Konservasi WDPA (2019)',
};

const forestLegend = [
  { value: 'APL', label: 'APL - Areal Penggunaan Lain', color: '#d6a84f' },
  { value: 'HP', label: 'HP - Hutan Produksi', color: '#2f855a' },
  { value: 'HPT', label: 'HPT - Hutan Produksi Terbatas', color: '#8fbf5a' },
  { value: 'HPK', label: 'HPK - Hutan Produksi yang Dapat Dikonversi', color: '#e76f51' },
  { value: 'Hutan Lindung', label: 'Hutan Lindung', color: '#2780a8' },
  { value: 'Kawasan Konservasi', label: 'Kawasan Konservasi', color: '#7651a6' },
];

const forestCategoryColors = Object.fromEntries(
  forestLegend.map(({ value, color }) => [value, color])
);

const wdpaLegend = [
  { value: 'Ia', label: 'Ia - Cagar Alam Ketat', color: '#a020f0' },
  { value: 'Ib', label: 'Ib - Kawasan Alam Liar', color: '#f04fd8' },
  { value: 'II', label: 'II - Taman Nasional', color: '#00bd45' },
  { value: 'III', label: 'III - Monumen Alam', color: '#f4e900' },
  { value: 'IV', label: 'IV - Habitat/Spesies', color: '#83dc00' },
  { value: 'V', label: 'V - Lanskap Dilindungi', color: '#168c48' },
  { value: 'VI', label: 'VI - Pemanfaatan Berkelanjutan', color: '#22bfd0' },
  { value: 'Not Reported', label: 'Kategori tidak dilaporkan', color: '#ffffff' },
  { value: 'Not Applicable', label: 'Kategori tidak berlaku', color: '#d1d5db' },
];

const wdpaCategoryColors = Object.fromEntries(
  wdpaLegend.map(({ value, color }) => [value, color])
);

export const LAYERS_CONFIG = Object.entries(kmzFiles)
  .map(([path, url]) => {
    const fileName = path.split('/').pop().replace(/\.kmz$/i, '');
    const id = fileName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    return {
      id,
      name: layerNames[fileName] || fileName.replace(/[_-]+/g, ' '),
      type: 'kmz',
      url,
      defaultVisible: id !== 'kawasan-hutan-tms',
      ...(id === 'kawasan-hutan-tms' && {
        legend: forestLegend,
        categoryColors: forestCategoryColors,
        categoryProperty: 'name',
      }),
      ...(id === 'wdpa-may2019-idn' && {
        legend: wdpaLegend,
        categoryColors: wdpaCategoryColors,
        categoryProperty: 'DESIG_ENG',
        labelProperty: 'WDPA_PID',
        preferredKml: 'WDPA_May2019_IDN_polygons.kml',
      }),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

/*
  // { 
  //   id: 'sendiki1', 
  //   name: 'Citra Sendiki 1', 
  //   type: 'image', 
  //   url: `${import.meta.env.BASE_URL}sendiki1.png`, 
  //   bounds: [[-8.416495941, 112.729402516], [-8.412378242, 112.733722168]], 
  //   defaultVisible: true 
  // },
  // { 
  //   id: 'sendiki2', 
  //   name: 'Citra Sendiki 2', 
  //   type: 'image', 
  //   url: `${import.meta.env.BASE_URL}sendiki2.png`, 
  //   bounds: [[-8.417032378, 112.722653396], [-8.411136533, 112.730621757]], 
  //   defaultVisible: true 
  // },
  // { 
  //   id: 'sendiki3', 
  //   name: 'Citra Sendiki 3', 
  //   type: 'image', 
  //   url: `${import.meta.env.BASE_URL}sendiki3.png`, 
  //   bounds: [[-8.418968330, 112.714142185], [-8.412651315, 112.723024363]], 
  //   defaultVisible: true 
  // }
];
*/
